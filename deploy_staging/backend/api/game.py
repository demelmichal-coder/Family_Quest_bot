# game.py - Herni logika: reset, schvalovani, odmeny, nakupy a progres

import asyncio
import os
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from api import get_current_user, require_role
from constants import ROLE_CHILD, ROLE_PARENT
from database import SessionLocal
from models import ChallengeProgress, Family, FamilyChallenge, Reward, RewardPurchase, Task, User
from notify import send_telegram_message
from schemas import (
    AchievementRead,
    BuyRewardResponse,
    ChildWeeklyStats,
    CompleteTaskResponse,
    FamilyStatsRead,
    FamilyWeeklyStatsRead,
    LeaderboardEntry,
    MessageResponse,
    RewardPurchaseRead,
    SeasonProgressRead,
)

router = APIRouter(prefix="/game", tags=["game"])

STREAK_BONUSES = {3: 10, 7: 25, 14: 50, 30: 100}
PARENT_CHAT_ID = os.getenv("PARENT_CHAT_ID", "").strip()


def _update_streak(user: User) -> tuple[int, int]:
    """Aktualizuje streak uzivatele. Vraci (nove_streak, bonus_xp)."""
    today = date.today()
    bonus_xp = 0

    if user.last_active_date is None or user.last_active_date < today - timedelta(days=1):
        user.current_streak = 1
    elif user.last_active_date == today - timedelta(days=1):
        user.current_streak = (user.current_streak or 0) + 1
    # elif last_active_date == today: streak se nemeni

    user.last_active_date = today
    bonus_xp = STREAK_BONUSES.get(user.current_streak, 0)
    if bonus_xp:
        user.xp += bonus_xp

    return user.current_streak, bonus_xp


SEASON_LENGTH_DAYS = 30
SEASON_XP_CAP = 1000
PASS_LEVEL_XP = 100

SEASON_START = datetime(2026, 4, 1, tzinfo=timezone.utc)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/reset-daily", summary="Reset dennich ukolu", response_model=MessageResponse)
def reset_daily(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    updated = db.query(Task).filter(Task.is_daily.is_(True)).update({Task.is_completed: False})
    db.commit()
    return {"detail": f"Resetovano {updated} dennic h ukolu."}


@router.post("/approve-task/{task_id}", summary="Schvalit mimoradny ukol", response_model=MessageResponse)
def approve_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Ukol nenalezen.")
    if task.is_daily:
        raise HTTPException(status_code=400, detail="Denni ukol schvaleni nepotrebuje.")
    if task.approved:
        raise HTTPException(status_code=400, detail="Ukol uz je schvaleny.")
    task.approved = True
    db.commit()
    return {"detail": "Ukol schvalen."}


@router.post(
    "/complete-task/{task_id}",
    summary="Dokoncit ukol a pridelit odmenu",
    response_model=CompleteTaskResponse,
)
def complete_task(
    task_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_user = db.query(User).filter(User.id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Aktualni uzivatel nenalezen.")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Ukol nenalezen.")
    if db_user.role != ROLE_PARENT and task.user_id != db_user.id:
        raise HTTPException(status_code=403, detail="Nelze splnit cizi ukol.")
    if task.is_completed:
        raise HTTPException(status_code=400, detail="Ukol uz je splneny.")
    if not task.is_daily and not task.approved and db_user.role != ROLE_PARENT:
        raise HTTPException(status_code=403, detail="Mimoradny ukol musi byt schvalen rodicem.")

    task.is_completed = True

    user = db.query(User).filter(User.id == task.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Uzivatel ukolu nenalezen.")

    user.xp += task.xp
    user.gold += task.gold

    # Streak update
    streak, bonus_xp = _update_streak(user)

    # Prispeni do aktivnich rodinnych vyzev
    challenge_completed_titles = []
    if user.family_id:
        now = datetime.now(timezone.utc)
        active_challenges = (
            db.query(FamilyChallenge)
            .filter(
                FamilyChallenge.family_id == user.family_id,
                FamilyChallenge.ends_at > now,
                FamilyChallenge.completed.is_(False),
            )
            .all()
        )
        for challenge in active_challenges:
            # Aktualizuj nebo vytvor progress zaznam
            progress = (
                db.query(ChallengeProgress)
                .filter(
                    ChallengeProgress.challenge_id == challenge.id,
                    ChallengeProgress.user_id == user.id,
                )
                .first()
            )
            if progress is None:
                progress = ChallengeProgress(challenge_id=challenge.id, user_id=user.id, contribution=0)
                db.add(progress)
            progress.contribution += 1

            # Zkontroluj, zda bylo dosazeno cile
            total = sum(
                (p.contribution + (1 if p.user_id == user.id else 0))
                for p in challenge.progress_entries
                if p != progress
            ) + progress.contribution
            if total >= challenge.target:
                challenge.completed = True
                # Bonus pro vsechny cleny rodiny
                family_members = db.query(User).filter(User.family_id == user.family_id).all()
                for member in family_members:
                    member.xp += challenge.bonus_xp
                    member.gold += challenge.bonus_gold
                challenge_completed_titles.append(challenge.title)

    db.commit()
    db.refresh(task)
    db.refresh(user)

    # Notifikace rodicovi
    child_name = user.username or user.telegram_id
    streak_info = f" 🔥 Streak: {streak} dni!" if streak >= 2 else ""
    bonus_info = f" Bonus +{bonus_xp} XP za streak!" if bonus_xp else ""
    if PARENT_CHAT_ID:
        msg = f"✅ {child_name} splnil/a ukol: <b>{task.title}</b> (+{task.xp} XP, +{task.gold} gold){streak_info}{bonus_info}"
        background_tasks.add_task(asyncio.run, send_telegram_message(PARENT_CHAT_ID, msg))

    detail = f"Ukol splnen. +{task.xp} XP, +{task.gold} gold."
    if bonus_xp:
        detail += f" 🔥 Streak bonus +{bonus_xp} XP!"
    if streak >= 2:
        detail += f" Serie: {streak} dni v rade!"
    for ct in challenge_completed_titles:
        detail += f" 🏆 Rodinná výzva splněna: {ct}!"

    return {
        "detail": detail,
        "task": task,
        "user": user,
        "streak": streak,
        "bonus_xp": bonus_xp,
    }


@router.post("/buy-reward/{reward_id}", summary="Koupit odmenu za gold", response_model=BuyRewardResponse)
def buy_reward(
    reward_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_user = db.query(User).filter(User.id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Aktualni uzivatel nenalezen.")

    reward = db.query(Reward).filter(Reward.id == reward_id).first()
    if not reward:
        raise HTTPException(status_code=404, detail="Odmena nenalezena.")
    if db_user.gold < reward.cost:
        raise HTTPException(status_code=400, detail="Nedostatek zlata.")

    db_user.gold -= reward.cost
    purchase = RewardPurchase(
        reward_id=reward.id,
        reward_name=reward.name,
        cost=reward.cost,
        user_id=db_user.id,
    )
    db.add(purchase)
    db.commit()
    db.refresh(db_user)
    db.refresh(purchase)
    return {
        "detail": f"Koupeno: {reward.name}.",
        "user": db_user,
        "purchase": purchase,
    }


@router.get("/purchase-history", summary="Historie nakupu odmen", response_model=list[RewardPurchaseRead])
def purchase_history(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role == ROLE_PARENT:
        # Parent sees all purchases in their family
        if current_user.family_id:
            family_user_ids = [
                u.id for u in db.query(User.id).filter(User.family_id == current_user.family_id).all()
            ]
            return (
                db.query(RewardPurchase)
                .filter(RewardPurchase.user_id.in_(family_user_ids))
                .order_by(RewardPurchase.purchased_at.desc())
                .all()
            )
    return (
        db.query(RewardPurchase)
        .filter(RewardPurchase.user_id == current_user.id)
        .order_by(RewardPurchase.purchased_at.desc())
        .all()
    )


@router.get("/leaderboard", summary="Zebricek clenov rodiny podle XP", response_model=list[LeaderboardEntry])
def leaderboard(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="Uzivatel neni clenem zadne rodiny.")
    members = (
        db.query(User)
        .filter(User.family_id == current_user.family_id)
        .order_by(User.xp.desc())
        .all()
    )
    result = []
    for rank, member in enumerate(members, start=1):
        completed = db.query(func.count(Task.id)).filter(
            Task.user_id == member.id, Task.is_completed.is_(True)
        ).scalar() or 0
        result.append(
            LeaderboardEntry(
                rank=rank,
                id=member.id,
                telegram_id=member.telegram_id,
                username=member.username,
                role=member.role,
                xp=member.xp,
                gold=member.gold,
                avatar=member.avatar,
                completed_tasks=completed,
                is_me=(member.id == current_user.id),
            )
        )
    return result


@router.get("/family-stats", summary="Statistiky rodiny", response_model=FamilyStatsRead)
def family_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="Uzivatel neni clenem zadne rodiny.")
    family = db.query(Family).filter(Family.id == current_user.family_id).first()
    member_ids = [u.id for u in db.query(User.id).filter(User.family_id == current_user.family_id).all()]
    total_members = len(member_ids)
    children_count = db.query(func.count(User.id)).filter(
        User.family_id == current_user.family_id, User.role == "child"
    ).scalar() or 0
    total_xp = db.query(func.sum(User.xp)).filter(User.family_id == current_user.family_id).scalar() or 0
    total_gold = db.query(func.sum(User.gold)).filter(User.family_id == current_user.family_id).scalar() or 0
    total_tasks = db.query(func.count(Task.id)).filter(Task.user_id.in_(member_ids)).scalar() or 0
    completed_tasks = db.query(func.count(Task.id)).filter(
        Task.user_id.in_(member_ids), Task.is_completed.is_(True)
    ).scalar() or 0
    daily_tasks = db.query(func.count(Task.id)).filter(
        Task.user_id.in_(member_ids), Task.is_daily.is_(True)
    ).scalar() or 0
    rewards_count = db.query(func.count(Reward.id)).filter(
        Reward.family_id == current_user.family_id
    ).scalar() or 0
    return FamilyStatsRead(
        family_id=family.id,
        family_name=family.name,
        members=total_members,
        children=children_count,
        total_xp=total_xp,
        total_gold=total_gold,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        daily_tasks=daily_tasks,
        rewards=rewards_count,
    )


@router.get("/season-progress", summary="Prubeh aktualni sezony", response_model=SeasonProgressRead)
def season_progress(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_user = db.query(User).filter(User.id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Aktualni uzivatel nenalezen.")

    now = datetime.now(timezone.utc)
    elapsed_days = (now - SEASON_START).days
    season_day = (elapsed_days % SEASON_LENGTH_DAYS) + 1
    season_index = max(0, elapsed_days // SEASON_LENGTH_DAYS)
    season_label = f"Sezona {season_index + 1}"

    season_xp = db_user.xp % SEASON_XP_CAP
    pass_level = min(10, (season_xp // PASS_LEVEL_XP) + 1)
    pass_level_progress = season_xp % PASS_LEVEL_XP

    return SeasonProgressRead(
        season_label=season_label,
        season_day=season_day,
        season_length_days=SEASON_LENGTH_DAYS,
        pass_level=pass_level,
        pass_level_progress_xp=pass_level_progress,
        pass_level_target_xp=PASS_LEVEL_XP,
        season_xp=season_xp,
    )


@router.get("/achievements", summary="Seznam achievementu", response_model=list[AchievementRead])
def achievements(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_user = db.query(User).filter(User.id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Aktualni uzivatel nenalezen.")

    completed_tasks = (
        db.query(func.count(Task.id))
        .filter(Task.user_id == db_user.id, Task.is_completed.is_(True))
        .scalar()
        or 0
    )
    daily_completed = (
        db.query(func.count(Task.id))
        .filter(Task.user_id == db_user.id, Task.is_completed.is_(True), Task.is_daily.is_(True))
        .scalar()
        or 0
    )

    rank = None
    if db_user.family_id:
        members = (
            db.query(User)
            .filter(User.family_id == db_user.family_id)
            .order_by(User.xp.desc(), User.gold.desc())
            .all()
        )
        for index, member in enumerate(members, start=1):
            if member.id == db_user.id:
                rank = index
                break

    items = [
        AchievementRead(
            id="first_steps",
            title="Prvni kroky",
            description="Dokoncit 1 misi.",
            unlocked=completed_tasks >= 1,
            progress=min(completed_tasks, 1),
            target=1,
        ),
        AchievementRead(
            id="task_runner",
            title="Task runner",
            description="Dokoncit 10 misi.",
            unlocked=completed_tasks >= 10,
            progress=min(completed_tasks, 10),
            target=10,
        ),
        AchievementRead(
            id="daily_streak",
            title="Daily master",
            description="Dokoncit 5 dennic h misi.",
            unlocked=daily_completed >= 5,
            progress=min(daily_completed, 5),
            target=5,
        ),
        AchievementRead(
            id="xp_hunter",
            title="XP Hunter",
            description="Dosahnout 250 XP.",
            unlocked=db_user.xp >= 250,
            progress=min(db_user.xp, 250),
            target=250,
        ),
        AchievementRead(
            id="gold_hoarder",
            title="Gold Hoarder",
            description="Nasbirat 150 gold.",
            unlocked=db_user.gold >= 150,
            progress=min(db_user.gold, 150),
            target=150,
        ),
        AchievementRead(
            id="family_top3",
            title="Rodinna elita",
            description="Byt v top 3 rodinneho zebricku.",
            unlocked=rank is not None and rank <= 3,
            progress=1 if rank is not None and rank <= 3 else 0,
            target=1,
        ),
    ]

    return items


@router.get("/family-weekly-stats", summary="Tydni statistiky rodiny per child", response_model=FamilyWeeklyStatsRead)
def family_weekly_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="Uzivatel neni clenem zadne rodiny.")

    children = (
        db.query(User)
        .filter(User.family_id == current_user.family_id, User.role == ROLE_CHILD)
        .all()
    )

    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=6)

    result = []
    for child in children:
        completed_all = (
            db.query(func.count(Task.id))
            .filter(Task.user_id == child.id, Task.is_completed.is_(True))
            .scalar()
            or 0
        )

        # 7-day activity: index 0 = 6 dni zpet, index 6 = dnes
        activity_days = []
        for day_offset in range(6, -1, -1):
            day_start = now - timedelta(days=day_offset)
            day_end = day_start + timedelta(days=1)
            count = (
                db.query(func.count(Task.id))
                .filter(
                    Task.user_id == child.id,
                    Task.is_completed.is_(True),
                    Task.created_at >= day_start,
                    Task.created_at < day_end,
                )
                .scalar()
                or 0
            )
            activity_days.append(count)

        result.append(
            ChildWeeklyStats(
                user_id=child.id,
                username=child.username or child.telegram_id,
                total_xp=child.xp,
                tasks_completed=completed_all,
                activity_days=activity_days,
            )
        )

    return FamilyWeeklyStatsRead(children=result)

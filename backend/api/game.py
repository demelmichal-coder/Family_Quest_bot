# game.py - Herni logika: reset, schvalovani, odmeny, nakupy a progres

import asyncio
import os
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

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
    ChildDailyActivity,
    ChildWeeklyStats,
    EngagementChildRead,
    EngagementSummaryRead,
    CompleteTaskResponse,
    FamilyDailyActivityRead,
    FamilyStatsRead,
    FamilyWeeklyStatsRead,
    LeaderboardEntry,
    MessageResponse,
    RewardPurchaseRead,
    SeasonProgressRead,
    TaskProofReview,
    TaskProofSubmit,
    TaskRead,
)

router = APIRouter(prefix="/game", tags=["game"])
APP_TIMEZONE = ZoneInfo("Europe/Prague")

STREAK_BONUSES = {3: 10, 7: 25, 14: 50, 30: 100}
PARENT_CHAT_ID = os.getenv("PARENT_CHAT_ID", "").strip()


def _notify_family_parents(db: Session, family_id: int | None, message: str, background_tasks: BackgroundTasks) -> None:
    if family_id:
        parent_ids = (
            db.query(User.telegram_id)
            .filter(User.family_id == family_id, User.role == ROLE_PARENT)
            .all()
        )
        for (telegram_id,) in parent_ids:
            if telegram_id:
                background_tasks.add_task(asyncio.run, send_telegram_message(telegram_id, message))
        return
    if PARENT_CHAT_ID:
        background_tasks.add_task(asyncio.run, send_telegram_message(PARENT_CHAT_ID, message))


def _grant_task_rewards(db: Session, user: User, task: Task) -> tuple[int, int, list[str]]:
    user.xp += task.xp
    user.gold += task.gold

    streak, bonus_xp = _update_streak(user)

    challenge_completed_titles: list[str] = []
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

            total = sum(
                (p.contribution + (1 if p.user_id == user.id else 0))
                for p in challenge.progress_entries
                if p != progress
            ) + progress.contribution
            if total >= challenge.target:
                challenge.completed = True
                family_members = db.query(User).filter(User.family_id == user.family_id).all()
                for member in family_members:
                    member.xp += challenge.bonus_xp
                    member.gold += challenge.bonus_gold
                challenge_completed_titles.append(challenge.title)

    return streak, bonus_xp, challenge_completed_titles


def _approval_detail(task: Task) -> str:
    time_suffix = f" do {task.due_time}" if task.due_time else ""
    return f"Ukol byl odeslan rodici ke schvaleni{time_suffix}."


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


def _score_task_proof(task: Task, proof_text: str, proof_media_url: str | None) -> tuple[int, bool, str]:
    text = (proof_text or "").strip().lower()
    score = 0

    if len(text) >= 20:
        score += 35
    elif len(text) >= 10:
        score += 20

    keywords = [w for w in f"{task.title} {task.description or ''}".lower().split() if len(w) >= 4]
    keyword_hits = sum(1 for kw in set(keywords[:10]) if kw in text)
    score += min(30, keyword_hits * 10)

    if proof_media_url:
        score += 20
    if any(marker in text for marker in ["hotovo", "splneno", "udelal", "dokoncil"]):
        score += 15

    flagged = score < 45
    note = (
        "AI: Duvod je dostatecny, muze pokracovat."
        if not flagged
        else "AI: Duvod je slaby, vyzaduje kontrolu rodicem."
    )
    return score, flagged, note


@router.post("/reset-daily", summary="Reset dennich ukolu", response_model=MessageResponse)
def reset_daily(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    updated = db.query(Task).filter(Task.is_daily.is_(True)).update(
        {
            Task.is_completed: False,
            Task.approved: False,
            Task.completed_at: None,
            Task.approval_requested_at: None,
            Task.approved_at: None,
            Task.proof_submitted_at: None,
            Task.proof_text: None,
            Task.proof_media_url: None,
            Task.ai_review_score: None,
            Task.ai_review_note: None,
            Task.ai_flagged: False,
            Task.last_reminded_at: None,
        }
    )
    db.commit()
    return {"detail": f"Resetovano {updated} dennic h ukolu."}


@router.post("/approve-task/{task_id}", summary="Schvalit mimoradny ukol", response_model=MessageResponse)
def approve_task(
    background_tasks: BackgroundTasks,
    task_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Ukol nenalezen.")
    if task.recurrence and task.parent_task_id is None:
        raise HTTPException(status_code=400, detail="Sablonu opakujiciho se ukolu nelze schvalit.")
    if task.approved:
        raise HTTPException(status_code=400, detail="Ukol uz je schvaleny.")
    if not task.is_completed:
        raise HTTPException(status_code=400, detail="Ukol jeste nebyl ditetem oznacen jako splneny.")
    if task.requires_proof and task.ai_flagged:
        raise HTTPException(status_code=400, detail="Nejdriv je potreba zkontrolovat dukaz splneni.")

    user = db.query(User).filter(User.id == task.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Uzivatel ukolu nenalezen.")
    if user.family_id != current_user.family_id:
        raise HTTPException(status_code=403, detail="Nelze schvalit ukol mimo vlastni rodinu.")

    task.approved = True
    task.approved_at = datetime.now(timezone.utc)
    streak, bonus_xp, challenge_completed_titles = _grant_task_rewards(db, user, task)
    db.commit()
    db.refresh(task)
    db.refresh(user)

    detail = f"Ukol schvalen. {user.username or user.telegram_id} dostava +{task.xp} XP a +{task.gold} gold."
    if bonus_xp:
        detail += f" Bonus za streak +{bonus_xp} XP."
    if challenge_completed_titles:
        detail += " " + " ".join(f"Rodinna vyzva splnena: {title}." for title in challenge_completed_titles)

    child_message = (
        f"🎉 Rodic schvalil ukol <b>{task.title}</b>. "
        f"Pripsano +{task.xp} XP a +{task.gold} gold."
    )
    background_tasks.add_task(asyncio.run, send_telegram_message(user.telegram_id, child_message))
    return {"detail": detail}


@router.post("/submit-proof/{task_id}", summary="Odeslat dukaz splneni ukolu", response_model=TaskRead)
def submit_task_proof(
    task_id: int,
    body: TaskProofSubmit,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Ukol nenalezen.")
    if task.user_id != current_user.id and current_user.role != ROLE_PARENT:
        raise HTTPException(status_code=403, detail="Nelze odeslat dukaz k cizimu ukolu.")

    score, flagged, note = _score_task_proof(task, body.proof_text, body.proof_media_url)
    task.proof_text = body.proof_text.strip()
    task.proof_media_url = (body.proof_media_url or "").strip() or None
    task.proof_submitted_at = datetime.now(timezone.utc)
    task.ai_review_score = score
    task.ai_review_note = note
    task.ai_flagged = flagged

    db.commit()
    db.refresh(task)
    return task


@router.post("/review-proof/{task_id}", summary="Rodic potvrdi nebo zamitne dukaz", response_model=TaskRead)
def review_task_proof(
    task_id: int,
    body: TaskProofReview,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Ukol nenalezen.")

    if not task.user_id:
        raise HTTPException(status_code=400, detail="Ukol nema prirazeneho uzivatele.")
    task_owner = db.query(User).filter(User.id == task.user_id).first()
    if not task_owner or task_owner.family_id != current_user.family_id:
        raise HTTPException(status_code=403, detail="Nelze hodnotit ukol mimo rodinu.")

    if body.approved:
        task.ai_flagged = False
        task.ai_review_note = (body.note or "Rodic dukaz schvalil.").strip()
    else:
        task.ai_flagged = True
        task.ai_review_note = (body.note or "Rodic pozaduje lepsi dukaz.").strip()

    db.commit()
    db.refresh(task)
    return task


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
    if task.recurrence and task.parent_task_id is None:
        raise HTTPException(status_code=400, detail="Sablonu opakujiciho se ukolu nelze dokoncit.")
    if db_user.role != ROLE_PARENT and task.user_id != db_user.id:
        raise HTTPException(status_code=403, detail="Nelze splnit cizi ukol.")
    if task.is_completed:
        raise HTTPException(status_code=400, detail="Ukol uz je splneny.")
    today_local = datetime.now(timezone.utc).astimezone(APP_TIMEZONE).date()
    if task.due_date and task.due_date != today_local:
        raise HTTPException(
            status_code=400,
            detail="Ukol lze splnit jen v den, na ktery byl naplanovany.",
        )
    if task.requires_proof and db_user.role != ROLE_PARENT:
        if not task.proof_submitted_at:
            raise HTTPException(status_code=400, detail="Ukol vyzaduje dukaz splneni.")
        if task.ai_flagged:
            raise HTTPException(status_code=403, detail="Dukaz ceka na schvaleni rodicem.")

    task.is_completed = True
    task.completed_at = datetime.now(timezone.utc)
    task.approval_requested_at = task.completed_at

    user = db.query(User).filter(User.id == task.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Uzivatel ukolu nenalezen.")
    if db_user.role == ROLE_PARENT and user.family_id != db_user.family_id:
        raise HTTPException(status_code=403, detail="Nelze splnit ukol mimo vlastni rodinu.")
    if db_user.role == ROLE_PARENT and task.user_id != db_user.id:
        raise HTTPException(
            status_code=400,
            detail="Rodic nemuze ukol ditete dokoncit misto nej. Pouzij schvaleni ukolu.",
        )

    if db_user.role == ROLE_PARENT:
        task.approved = True
        task.approved_at = datetime.now(timezone.utc)
        streak, bonus_xp, challenge_completed_titles = _grant_task_rewards(db, user, task)
        db.commit()
        db.refresh(task)
        db.refresh(user)

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

    if task.approved:
        task.approved_at = task.approved_at or task.completed_at
        streak, bonus_xp, challenge_completed_titles = _grant_task_rewards(db, user, task)
        db.commit()
        db.refresh(task)
        db.refresh(user)

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

    db.commit()
    db.refresh(task)
    db.refresh(user)

    child_name = user.username or user.telegram_id
    parent_message = (
        f"✅ {child_name} oznacil/a ukol <b>{task.title}</b> jako splneny. "
        f"Ceka na tvoje schvaleni."
    )
    _notify_family_parents(db, user.family_id, parent_message, background_tasks)

    return {
        "detail": _approval_detail(task),
        "task": task,
        "user": user,
        "streak": user.current_streak,
        "bonus_xp": 0,
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
            Task.user_id == member.id, Task.approved.is_(True)
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
        Task.user_id.in_(member_ids), Task.approved.is_(True)
    ).scalar() or 0
    pending_approval = db.query(func.count(Task.id)).filter(
        Task.user_id.in_(member_ids), Task.is_completed.is_(True), Task.approved.is_(False)
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
        pending_approval=pending_approval,
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
        .filter(Task.user_id == db_user.id, Task.approved.is_(True))
        .scalar()
        or 0
    )
    daily_completed = (
        db.query(func.count(Task.id))
        .filter(Task.user_id == db_user.id, Task.approved.is_(True), Task.is_daily.is_(True))
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
            icon="⭐",
        ),
        AchievementRead(
            id="task_runner",
            title="Task runner",
            description="Dokoncit 10 misi.",
            unlocked=completed_tasks >= 10,
            progress=min(completed_tasks, 10),
            target=10,
            icon="🏃",
        ),
        AchievementRead(
            id="daily_streak",
            title="Daily master",
            description="Dokoncit 5 dennic h misi.",
            unlocked=daily_completed >= 5,
            progress=min(daily_completed, 5),
            target=5,
            icon="📅",
        ),
        AchievementRead(
            id="xp_hunter",
            title="XP Hunter",
            description="Dosahnout 250 XP.",
            unlocked=db_user.xp >= 250,
            progress=min(db_user.xp, 250),
            target=250,
            icon="💎",
        ),
        AchievementRead(
            id="gold_hoarder",
            title="Gold Hoarder",
            description="Nasbirat 150 gold.",
            unlocked=db_user.gold >= 150,
            progress=min(db_user.gold, 150),
            target=150,
            icon="🪙",
        ),
        AchievementRead(
            id="family_top3",
            title="Rodinna elita",
            description="Byt v top 3 rodinneho zebricku.",
            unlocked=rank is not None and rank <= 3,
            progress=1 if rank is not None and rank <= 3 else 0,
            target=1,
            icon="🏆",
        ),
        AchievementRead(
            id="streak_3",
            title="Na vlne",
            description="Dosahnout 3denni serie aktivit.",
            unlocked=(db_user.current_streak or 0) >= 3,
            progress=min(db_user.current_streak or 0, 3),
            target=3,
            icon="🔥",
        ),
        AchievementRead(
            id="streak_7",
            title="Tydenni hrdina",
            description="Dosahnout 7denni serie aktivit.",
            unlocked=(db_user.current_streak or 0) >= 7,
            progress=min(db_user.current_streak or 0, 7),
            target=7,
            icon="⚡",
        ),
        AchievementRead(
            id="task_master",
            title="Task Master",
            description="Dokoncit 25 misi.",
            unlocked=completed_tasks >= 25,
            progress=min(completed_tasks, 25),
            target=25,
            icon="🎯",
        ),
        AchievementRead(
            id="xp_legend",
            title="XP Legenda",
            description="Dosahnout 500 XP.",
            unlocked=db_user.xp >= 500,
            progress=min(db_user.xp, 500),
            target=500,
            icon="👑",
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
            .filter(Task.user_id == child.id, Task.approved.is_(True))
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
                    Task.approved.is_(True),
                    func.coalesce(Task.approved_at, Task.completed_at, Task.created_at) >= day_start,
                    func.coalesce(Task.approved_at, Task.completed_at, Task.created_at) < day_end,
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


@router.get("/daily-activity", summary="Dnesni aktivita rodiny", response_model=FamilyDailyActivityRead)
def daily_activity(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="Uzivatel neni clenem zadne rodiny.")

    children = (
        db.query(User)
        .filter(User.family_id == current_user.family_id, User.role == ROLE_CHILD)
        .all()
    )

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_str = today_start.strftime("%Y-%m-%d")

    total_pending = (
        db.query(func.count(Task.id))
        .join(User, User.id == Task.user_id)
        .filter(
            User.family_id == current_user.family_id,
            Task.is_completed.is_(True),
            Task.approved.is_(False),
        )
        .scalar() or 0
    )

    result = []
    for child in children:
        today_tasks = (
            db.query(Task)
            .filter(
                Task.user_id == child.id,
                Task.approved.is_(True),
                func.coalesce(Task.approved_at, Task.completed_at) >= today_start,
            )
            .all()
        )
        xp_today = sum(t.xp for t in today_tasks)
        gold_today = sum(t.gold for t in today_tasks)
        pending = (
            db.query(func.count(Task.id))
            .filter(
                Task.user_id == child.id,
                Task.is_completed.is_(True),
                Task.approved.is_(False),
            )
            .scalar() or 0
        )
        result.append(
            ChildDailyActivity(
                user_id=child.id,
                username=child.username or child.telegram_id,
                avatar=child.avatar,
                tasks_done_today=len(today_tasks),
                xp_earned_today=xp_today,
                gold_earned_today=gold_today,
                streak=child.current_streak or 0,
                pending_approval=pending,
            )
        )

    return FamilyDailyActivityRead(
        date=today_str,
        children=result,
        total_pending_approval=total_pending,
    )


@router.get(
    "/engagement-summary",
    summary="Souhrn engagement metrik rodiny za poslednich 7 dni",
    response_model=EngagementSummaryRead,
)
def engagement_summary(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="Uzivatel neni clenem zadne rodiny.")

    period_days = 7
    now = datetime.now(timezone.utc)
    period_start = (now - timedelta(days=period_days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    period_end = now

    children = (
        db.query(User)
        .filter(User.family_id == current_user.family_id, User.role == ROLE_CHILD)
        .all()
    )
    child_ids = [child.id for child in children]

    if not child_ids:
        return EngagementSummaryRead(
            period_days=period_days,
            period_start=period_start.date().isoformat(),
            period_end=period_end.date().isoformat(),
            children_total=0,
            active_children_7d=0,
            assigned_tasks_7d=0,
            completed_tasks_7d=0,
            purchases_7d=0,
            completion_rate_7d=0.0,
            children=[],
        )

    assigned_total = (
        db.query(func.count(Task.id))
        .filter(
            Task.user_id.in_(child_ids),
            Task.created_at >= period_start,
            Task.created_at <= period_end,
        )
        .scalar()
        or 0
    )

    completed_total = (
        db.query(func.count(Task.id))
        .filter(
            Task.user_id.in_(child_ids),
            Task.approved.is_(True),
            func.coalesce(Task.approved_at, Task.completed_at, Task.created_at) >= period_start,
            func.coalesce(Task.approved_at, Task.completed_at, Task.created_at) <= period_end,
        )
        .scalar()
        or 0
    )

    purchases_total = (
        db.query(func.count(RewardPurchase.id))
        .filter(
            RewardPurchase.user_id.in_(child_ids),
            RewardPurchase.purchased_at >= period_start,
            RewardPurchase.purchased_at <= period_end,
        )
        .scalar()
        or 0
    )

    active_children = (
        db.query(func.count(func.distinct(Task.user_id)))
        .filter(
            Task.user_id.in_(child_ids),
            Task.approved.is_(True),
            func.coalesce(Task.approved_at, Task.completed_at, Task.created_at) >= period_start,
            func.coalesce(Task.approved_at, Task.completed_at, Task.created_at) <= period_end,
        )
        .scalar()
        or 0
    )

    completion_rate_total = 0.0
    if assigned_total > 0:
        completion_rate_total = round((completed_total / assigned_total) * 100, 1)

    children_summary: list[EngagementChildRead] = []
    for child in children:
        child_assigned = (
            db.query(func.count(Task.id))
            .filter(
                Task.user_id == child.id,
                Task.created_at >= period_start,
                Task.created_at <= period_end,
            )
            .scalar()
            or 0
        )
        child_completed = (
            db.query(func.count(Task.id))
            .filter(
                Task.user_id == child.id,
                Task.approved.is_(True),
                func.coalesce(Task.approved_at, Task.completed_at, Task.created_at) >= period_start,
                func.coalesce(Task.approved_at, Task.completed_at, Task.created_at) <= period_end,
            )
            .scalar()
            or 0
        )
        child_pending = (
            db.query(func.count(Task.id))
            .filter(
                Task.user_id == child.id,
                Task.is_completed.is_(True),
                Task.approved.is_(False),
            )
            .scalar()
            or 0
        )

        child_completion_rate = 0.0
        if child_assigned > 0:
            child_completion_rate = round((child_completed / child_assigned) * 100, 1)

        children_summary.append(
            EngagementChildRead(
                user_id=child.id,
                username=child.username or child.telegram_id,
                assigned_tasks_7d=child_assigned,
                completed_tasks_7d=child_completed,
                pending_approval=child_pending,
                completion_rate_7d=child_completion_rate,
                streak=child.current_streak or 0,
            )
        )

    children_summary.sort(key=lambda item: (-item.completion_rate_7d, -item.completed_tasks_7d, item.username.lower()))

    return EngagementSummaryRead(
        period_days=period_days,
        period_start=period_start.date().isoformat(),
        period_end=period_end.date().isoformat(),
        children_total=len(children),
        active_children_7d=active_children,
        assigned_tasks_7d=assigned_total,
        completed_tasks_7d=completed_total,
        purchases_7d=purchases_total,
        completion_rate_7d=completion_rate_total,
        children=children_summary,
    )

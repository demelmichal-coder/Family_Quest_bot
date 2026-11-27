# goals.py - Spolecny rodinny cil: deti dohromady sbiraji XP na spolecnou odmenu.

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from api import get_current_user, get_db, require_role
from constants import ROLE_CHILD, ROLE_PARENT
from models import FamilyGoal, Task, User
from push_notify import send_push_to_users
from schemas import MessageResponse

router = APIRouter(prefix="/goals", tags=["goals"])


class GoalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    target_xp: int = Field(ge=10, le=100000)

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Napiš aspoň dva znaky.")
        return value


def _progress_xp(db: Session, goal: FamilyGoal) -> int:
    """XP, ktere deti rodiny ziskaly od zalozeni cile (schvalene ukoly)."""
    child_ids = [
        u.id for u in db.query(User.id).filter(User.family_id == goal.family_id, User.role == ROLE_CHILD).all()
    ]
    if not child_ids:
        return 0
    when = func.coalesce(Task.approved_at, Task.completed_at, Task.created_at)
    total = (
        db.query(func.coalesce(func.sum(Task.xp), 0))
        .filter(Task.user_id.in_(child_ids), Task.approved.is_(True), when >= goal.created_at)
        .scalar()
    )
    return int(total or 0)


def _serialize(db: Session, goal: FamilyGoal) -> dict:
    progress = _progress_xp(db, goal)
    return {
        "id": goal.id,
        "title": goal.title,
        "target_xp": goal.target_xp,
        "progress_xp": min(progress, goal.target_xp),
        "percent": min(100, round(progress * 100 / goal.target_xp)) if goal.target_xp else 0,
        "reached": progress >= goal.target_xp,
        "completed_at": goal.completed_at,
        "created_at": goal.created_at,
    }


def _active_goal(db: Session, family_id: int) -> FamilyGoal | None:
    return (
        db.query(FamilyGoal)
        .filter(FamilyGoal.family_id == family_id, FamilyGoal.active.is_(True))
        .order_by(FamilyGoal.id.desc())
        .first()
    )


@router.get("/active", summary="Aktuální rodinný cíl (nebo null)")
def get_active_goal(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.family_id:
        return None
    goal = _active_goal(db, current_user.family_id)
    return _serialize(db, goal) if goal else None


@router.post("/", summary="Rodič založí rodinný cíl")
def create_goal(
    payload: GoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_PARENT)),
):
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="Nejdřív vytvoř nebo se připoj do rodiny.")
    if _active_goal(db, current_user.family_id):
        raise HTTPException(status_code=409, detail="Nejdřív dokonči nebo zruš aktuální rodinný cíl.")
    goal = FamilyGoal(family_id=current_user.family_id, title=payload.title, target_xp=payload.target_xp)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _serialize(db, goal)


@router.post("/{goal_id}/complete", summary="Rodič potvrdí splnění cíle")
def complete_goal(
    goal_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_PARENT)),
):
    goal = db.query(FamilyGoal).filter(FamilyGoal.id == goal_id).first()
    if not goal or goal.family_id != current_user.family_id or not goal.active:
        raise HTTPException(status_code=404, detail="Rodinný cíl nenalezen.")
    if _progress_xp(db, goal) < goal.target_xp:
        raise HTTPException(status_code=400, detail="Cíl ještě není splněný.")

    goal.active = False
    goal.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(goal)

    member_ids = [u.id for u in db.query(User.id).filter(User.family_id == goal.family_id).all()]
    background.add_task(
        send_push_to_users, member_ids, "Family Quest", f"Rodinný cíl splněn: {goal.title}! Užijte si to.", "/"
    )
    return _serialize(db, goal)


@router.delete("/{goal_id}", summary="Rodič zruší rodinný cíl", response_model=MessageResponse)
def cancel_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_PARENT)),
):
    goal = db.query(FamilyGoal).filter(FamilyGoal.id == goal_id).first()
    if not goal or goal.family_id != current_user.family_id or not goal.active:
        raise HTTPException(status_code=404, detail="Rodinný cíl nenalezen.")
    db.delete(goal)
    db.commit()
    return {"detail": "Rodinný cíl byl zrušen."}

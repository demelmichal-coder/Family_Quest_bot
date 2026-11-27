# offers.py - Nabidka volnych ukolu: rodic vystavi ukol bez prirazeni, prvni dite si ho vezme.

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from api import get_current_user, get_db, require_role
from constants import ROLE_CHILD, ROLE_PARENT
from models import Task, User
from push_notify import send_push_to_users
from schemas import MessageResponse, TaskRead

router = APIRouter(prefix="/offers", tags=["offers"])


class OfferCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    xp: int = Field(default=10, ge=0, le=1000)
    gold: int = Field(default=0, ge=0, le=1000)
    requires_proof: bool = False

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Název nesmí být prázdný.")
        return value


def _family_member_ids(db: Session, family_id: int, role: str) -> list[int]:
    return [u.id for u in db.query(User).filter(User.family_id == family_id, User.role == role).all()]


@router.get("/", summary="Volné úkoly k rozebrání", response_model=list[TaskRead])
def list_offers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.family_id:
        return []
    return (
        db.query(Task)
        .filter(Task.offer_family_id == current_user.family_id, Task.user_id.is_(None))
        .order_by(Task.id.desc())
        .all()
    )


@router.post("/", summary="Rodič vystaví volný úkol", response_model=TaskRead)
def create_offer(
    payload: OfferCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_PARENT)),
):
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="Nejdřív vytvoř nebo se připoj do rodiny.")

    task = Task(
        title=payload.title,
        description=(payload.description or "").strip() or None,
        xp=payload.xp,
        gold=payload.gold,
        is_daily=False,
        requires_proof=payload.requires_proof,
        user_id=None,
        offer_family_id=current_user.family_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    children = _family_member_ids(db, current_user.family_id, ROLE_CHILD)
    if children:
        background.add_task(
            send_push_to_users, children, "Family Quest", f"Nový volný úkol: {task.title}", "/"
        )
    return task


@router.post("/{task_id}/claim", summary="Dítě si vezme volný úkol", response_model=TaskRead)
def claim_offer(
    task_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_CHILD)),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or (task.user_id is None and task.offer_family_id != current_user.family_id):
        raise HTTPException(status_code=404, detail="Volný úkol nenalezen.")
    if task.user_id is not None:
        raise HTTPException(status_code=409, detail="Tenhle úkol si už vzal někdo jiný.")

    # Atomicky: uspeje jen prvni dite, ktere stihne UPDATE (dalsi uz neuvidi user_id IS NULL).
    updated = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id.is_(None), Task.offer_family_id == current_user.family_id)
        .update({Task.user_id: current_user.id, Task.offer_family_id: None}, synchronize_session=False)
    )
    db.commit()
    if updated != 1:
        raise HTTPException(status_code=409, detail="Tenhle úkol si už vzal někdo jiný.")

    db.refresh(task)
    parents = _family_member_ids(db, current_user.family_id, ROLE_PARENT)
    if parents:
        name = current_user.username or "Dítě"
        background.add_task(
            send_push_to_users, parents, "Family Quest", f"{name} si vzal(a) úkol: {task.title}", "/"
        )
    return task


@router.delete("/{task_id}", summary="Rodič stáhne volný úkol", response_model=MessageResponse)
def withdraw_offer(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_PARENT)),
):
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id.is_(None), Task.offer_family_id == current_user.family_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Volný úkol nenalezen.")
    db.delete(task)
    db.commit()
    return {"detail": "Volný úkol byl stažen."}

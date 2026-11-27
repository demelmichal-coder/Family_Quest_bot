# wishes.py - Prani deti: dite navrhne odmenu, rodic ji schvali (vznikne Reward) nebo zamitne.

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from api import get_current_user, get_db, require_role
from constants import ROLE_CHILD, ROLE_PARENT
from models import Reward, RewardWish, User
from push_notify import send_push_to_users
from schemas import MessageResponse

router = APIRouter(prefix="/wishes", tags=["wishes"])

MAX_PENDING_PER_CHILD = 5
MAX_COST = 100000


class WishCreate(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    suggested_cost: int = Field(default=0, ge=0, le=MAX_COST)

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Napiš aspoň dva znaky.")
        return value


class WishApprove(BaseModel):
    cost: int | None = Field(default=None, ge=0, le=MAX_COST)
    note: str | None = Field(default=None, max_length=200)


class WishReject(BaseModel):
    note: str | None = Field(default=None, max_length=200)


def _serialize(wish: RewardWish) -> dict:
    return {
        "id": wish.id,
        "user_id": wish.user_id,
        "username": wish.user.username if wish.user else None,
        "title": wish.title,
        "suggested_cost": wish.suggested_cost,
        "status": wish.status,
        "parent_note": wish.parent_note,
        "reward_id": wish.reward_id,
        "created_at": wish.created_at,
        "resolved_at": wish.resolved_at,
    }


def _get_family_wish(db: Session, wish_id: int, family_id: int) -> RewardWish:
    wish = db.query(RewardWish).filter(RewardWish.id == wish_id).first()
    if not wish or wish.family_id != family_id:
        raise HTTPException(status_code=404, detail="Přání nenalezeno.")
    return wish


@router.get("/", summary="Seznam přání (dítě vidí svá, rodič všechna v rodině)")
def list_wishes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.family_id:
        return []
    query = db.query(RewardWish).filter(RewardWish.family_id == current_user.family_id)
    if current_user.role != ROLE_PARENT:
        query = query.filter(RewardWish.user_id == current_user.id)
    wishes = query.order_by(RewardWish.id.desc()).all()
    # Cekajici nahoru, zbytek podle noveho.
    wishes.sort(key=lambda w: 0 if w.status == "pending" else 1)
    return [_serialize(w) for w in wishes]


@router.post("/", summary="Dítě navrhne odměnu")
def create_wish(
    payload: WishCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_CHILD)),
):
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="Nejdřív se připoj do rodiny.")
    pending = (
        db.query(RewardWish)
        .filter(RewardWish.user_id == current_user.id, RewardWish.status == "pending")
        .count()
    )
    if pending >= MAX_PENDING_PER_CHILD:
        raise HTTPException(
            status_code=400,
            detail=f"Můžeš mít najednou nejvýš {MAX_PENDING_PER_CHILD} čekajících přání.",
        )

    wish = RewardWish(
        family_id=current_user.family_id,
        user_id=current_user.id,
        title=payload.title,
        suggested_cost=payload.suggested_cost,
    )
    db.add(wish)
    db.commit()
    db.refresh(wish)

    parent_ids = [
        u.id
        for u in db.query(User).filter(User.family_id == current_user.family_id, User.role == ROLE_PARENT).all()
    ]
    if parent_ids:
        name = current_user.username or "Dítě"
        background.add_task(
            send_push_to_users, parent_ids, "Family Quest", f"{name} si přeje: {wish.title}", "/"
        )
    return _serialize(wish)


@router.post("/{wish_id}/approve", summary="Rodič schválí přání a vznikne odměna v obchodě")
def approve_wish(
    wish_id: int,
    payload: WishApprove,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_PARENT)),
):
    wish = _get_family_wish(db, wish_id, current_user.family_id)
    if wish.status != "pending":
        raise HTTPException(status_code=409, detail="Přání už bylo vyřízeno.")

    cost = payload.cost if payload.cost is not None else wish.suggested_cost
    child_name = wish.user.username if wish.user else "dítě"
    reward = Reward(
        name=wish.title,
        cost=cost,
        description=f"Přání od {child_name}",
        family_id=current_user.family_id,
    )
    db.add(reward)
    db.flush()

    wish.status = "approved"
    wish.reward_id = reward.id
    wish.parent_note = (payload.note or "").strip() or None
    wish.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(wish)

    background.add_task(
        send_push_to_users,
        [wish.user_id],
        "Family Quest",
        f"Tvoje přání „{wish.title}“ je v obchodě za {cost} zlata!",
        "/",
    )
    return _serialize(wish)


@router.post("/{wish_id}/reject", summary="Rodič přání zamítne")
def reject_wish(
    wish_id: int,
    payload: WishReject,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_PARENT)),
):
    wish = _get_family_wish(db, wish_id, current_user.family_id)
    if wish.status != "pending":
        raise HTTPException(status_code=409, detail="Přání už bylo vyřízeno.")

    wish.status = "rejected"
    wish.parent_note = (payload.note or "").strip() or None
    wish.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(wish)

    suffix = f" ({wish.parent_note})" if wish.parent_note else ""
    background.add_task(
        send_push_to_users, [wish.user_id], "Family Quest", f"Přání „{wish.title}“ tentokrát nevyšlo{suffix}.", "/"
    )
    return _serialize(wish)


@router.delete("/{wish_id}", summary="Dítě zruší své čekající přání", response_model=MessageResponse)
def cancel_wish(
    wish_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_CHILD)),
):
    wish = _get_family_wish(db, wish_id, current_user.family_id)
    if wish.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Můžeš zrušit jen své přání.")
    if wish.status != "pending":
        raise HTTPException(status_code=409, detail="Vyřízené přání už nejde zrušit.")
    db.delete(wish)
    db.commit()
    return {"detail": "Přání zrušeno."}

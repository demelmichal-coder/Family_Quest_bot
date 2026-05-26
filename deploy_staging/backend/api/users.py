# users.py - API endpointy pro uzivatele

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api import get_current_user, get_db, require_role
from constants import ROLE_PARENT, USER_ROLES
from messages import (
    OUTSIDE_FAMILY,
    OWN_PROFILE_ONLY,
    USER_DELETED,
    USER_NOT_FOUND,
)
from models import User
from schemas import MessageResponse, UserRead

router = APIRouter(prefix="/users", tags=["users"])


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    return user


def _ensure_family_access(current_user: User, target_user: User, detail: str) -> None:
    if current_user.id == target_user.id:
        return
    if current_user.role != ROLE_PARENT:
        raise HTTPException(status_code=403, detail=detail)
    if not current_user.family_id or current_user.family_id != target_user.family_id:
        raise HTTPException(status_code=403, detail=detail)


class UserCreate(BaseModel):
    telegram_id: str
    username: str = ""
    role: str
    xp: int = 0
    gold: int = 0


class UserUpdate(BaseModel):
    username: str | None = None
    role: str | None = None
    xp: int | None = None
    gold: int | None = None
    avatar: str | None = None


@router.get("/", summary="Seznam uzivatelu", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    if not current_user.family_id:
        return []
    return db.query(User).filter(User.family_id == current_user.family_id).all()


@router.get("/me", summary="Aktualni uzivatel", response_model=UserRead)
def get_me(current_user=Depends(get_current_user)):
    return current_user


@router.get("/{user_id}", summary="Detail uzivatele", response_model=UserRead)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = _get_user_or_404(db, user_id)
    _ensure_family_access(current_user, user, "Nelze zobrazit uzivatele mimo rodinu.")
    return user


@router.post("/", summary="Vytvorit uzivatele", response_model=UserRead)
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="Nejdriv je potreba byt soucasti rodiny.")
    if user.role not in USER_ROLES:
        raise HTTPException(status_code=400, detail="Role musi byt parent, child nebo pending.")

    new_user = User(
        telegram_id=user.telegram_id,
        username=user.username.strip() or None,
        role=user.role,
        xp=user.xp,
        gold=user.gold,
        family_id=current_user.family_id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.put("/{user_id}", summary="Upravit uzivatele", response_model=UserRead)
def update_user(
    user_id: int,
    user: UserUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_user = _get_user_or_404(db, user_id)
    _ensure_family_access(current_user, db_user, "Nelze upravit uzivatele mimo rodinu.")

    updates = user.model_dump(exclude_unset=True)
    if current_user.role != ROLE_PARENT and current_user.id == db_user.id:
        for restricted_field in ("role", "xp", "gold"):
            if restricted_field in updates:
                raise HTTPException(
                    status_code=403,
                    detail=OWN_PROFILE_ONLY,
                )

    for key, value in updates.items():
        setattr(db_user, key, value)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.delete("/{user_id}", summary="Smazat uzivatele", response_model=MessageResponse)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    db_user = _get_user_or_404(db, user_id)
    if current_user.family_id != db_user.family_id:
        raise HTTPException(status_code=403, detail=f"Nelze smazat uzivatele {OUTSIDE_FAMILY}.")
    db.delete(db_user)
    db.commit()
    return {"detail": USER_DELETED}

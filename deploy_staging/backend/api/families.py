import secrets
import string

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api import get_current_user, get_db
from constants import FAMILY_ROLES, ROLE_PARENT
from messages import FAMILY_NOT_FOUND, INVITE_CODE_NOT_FOUND, USER_ALREADY_IN_FAMILY, USER_NOT_FOUND, USER_NOT_IN_FAMILY
from models import Family, User
from schemas import FamilyDetailRead, FamilyRead, UserRead

router = APIRouter(prefix="/families", tags=["families"])


def _generate_invite_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))


def _unique_invite_code(db: Session) -> str:
    while True:
        code = _generate_invite_code()
        exists = db.query(Family).filter(Family.invite_code == code).first()
        if not exists:
            return code


class FamilyCreate(BaseModel):
    name: str
    username: str = ""


class FamilyJoin(BaseModel):
    invite_code: str
    role: str
    username: str = ""


@router.get("/me", summary="Aktualni rodina", response_model=FamilyDetailRead)
def get_my_family(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not current_user.family_id:
        raise HTTPException(status_code=404, detail=USER_NOT_IN_FAMILY)

    family = db.query(Family).filter(Family.id == current_user.family_id).first()
    if not family:
        raise HTTPException(status_code=404, detail=FAMILY_NOT_FOUND)
    return family


@router.post("/create", summary="Vytvorit rodinu", response_model=UserRead)
def create_family(
    payload: FamilyCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_user = db.query(User).filter(User.id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    if db_user.family_id:
        raise HTTPException(status_code=400, detail=USER_ALREADY_IN_FAMILY)

    family = Family(
        name=payload.name.strip(),
        invite_code=_unique_invite_code(db),
    )
    db.add(family)
    db.flush()

    if payload.username.strip():
        db_user.username = payload.username.strip()
    db_user.family_id = family.id
    db_user.role = ROLE_PARENT

    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/join", summary="Pripojit se do rodiny", response_model=UserRead)
def join_family(
    payload: FamilyJoin,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_user = db.query(User).filter(User.id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND)
    if db_user.family_id:
        raise HTTPException(status_code=400, detail=USER_ALREADY_IN_FAMILY)

    role = payload.role.strip().lower()
    if role not in FAMILY_ROLES:
        raise HTTPException(status_code=400, detail="Role musi byt parent nebo child.")

    family = (
        db.query(Family)
        .filter(Family.invite_code == payload.invite_code.strip().upper())
        .first()
    )
    if not family:
        raise HTTPException(status_code=404, detail=INVITE_CODE_NOT_FOUND)

    if payload.username.strip():
        db_user.username = payload.username.strip()
    db_user.family_id = family.id
    db_user.role = role

    db.commit()
    db.refresh(db_user)
    return db_user

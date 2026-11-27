import secrets
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api import get_current_user, get_db, require_role
from constants import FAMILY_ROLES, ROLE_PARENT
from messages import FAMILY_NOT_FOUND, INVITE_CODE_NOT_FOUND, USER_ALREADY_IN_FAMILY, USER_NOT_FOUND, USER_NOT_IN_FAMILY
from models import (
    ChallengeProgress,
    Family,
    FamilyChallenge,
    FamilyGoal,
    PushSubscription,
    Reward,
    RewardPurchase,
    RewardWish,
    Task,
    User,
)
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
        raise HTTPException(status_code=400, detail="Role musí být parent nebo child.")

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


DELETE_CONFIRMATION = "SMAZAT RODINU"


class FamilyDeleteRequest(BaseModel):
    confirm: str


@router.get("/me/export", summary="Export dat rodiny (JSON ke stažení)")
def export_family_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_PARENT)),
):
    family = db.query(Family).filter(Family.id == current_user.family_id).first()
    if not family:
        raise HTTPException(status_code=404, detail=FAMILY_NOT_FOUND)

    members = db.query(User).filter(User.family_id == family.id).all()
    member_ids = [m.id for m in members]
    tasks = db.query(Task).filter(Task.user_id.in_(member_ids)).order_by(Task.id).all() if member_ids else []
    purchases = db.query(RewardPurchase).filter(RewardPurchase.user_id.in_(member_ids)).all() if member_ids else []

    data = {
        "exported_at": datetime.now(timezone.utc),
        "family": {"id": family.id, "name": family.name, "created_at": family.created_at},
        "members": [
            {
                "id": m.id,
                "username": m.username,
                "role": m.role,
                "xp": m.xp,
                "gold": m.gold,
                "current_streak": m.current_streak,
            }
            for m in members
        ],
        "tasks": [
            {
                "id": t.id,
                "user_id": t.user_id,
                "title": t.title,
                "description": t.description,
                "xp": t.xp,
                "gold": t.gold,
                "is_completed": t.is_completed,
                "approved": t.approved,
                "created_at": t.created_at,
                "completed_at": t.completed_at,
                "approved_at": t.approved_at,
                "due_date": t.due_date,
                "feedback": t.feedback,
                "proof_text": t.proof_text,
                # Fotky se do exportu nevkladaji (velikost); jen informace, ze existuji.
                "has_proof_photo": bool(t.proof_media_url),
            }
            for t in tasks
        ],
        "rewards": [
            {"id": r.id, "name": r.name, "cost": r.cost, "description": r.description}
            for r in db.query(Reward).filter(Reward.family_id == family.id).all()
        ],
        "purchases": [
            {"user_id": p.user_id, "reward_name": p.reward_name, "cost": p.cost, "purchased_at": p.purchased_at}
            for p in purchases
        ],
        "wishes": [
            {
                "user_id": w.user_id,
                "title": w.title,
                "suggested_cost": w.suggested_cost,
                "status": w.status,
                "created_at": w.created_at,
            }
            for w in db.query(RewardWish).filter(RewardWish.family_id == family.id).all()
        ],
        "goals": [
            {
                "title": g.title,
                "target_xp": g.target_xp,
                "created_at": g.created_at,
                "completed_at": g.completed_at,
            }
            for g in db.query(FamilyGoal).filter(FamilyGoal.family_id == family.id).all()
        ],
    }
    return JSONResponse(
        content=jsonable_encoder(data),
        headers={"Content-Disposition": 'attachment; filename="family-quest-export.json"'},
    )


@router.post("/me/delete", summary="Trvale smazat rodinu a všechna její data")
def delete_family_data(
    payload: FamilyDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_PARENT)),
):
    if payload.confirm.strip() != DELETE_CONFIRMATION:
        raise HTTPException(status_code=400, detail=f"Pro potvrzení napiš přesně: {DELETE_CONFIRMATION}")

    family_id = current_user.family_id
    family = db.query(Family).filter(Family.id == family_id).first()
    if not family:
        raise HTTPException(status_code=404, detail=FAMILY_NOT_FOUND)

    member_ids = [u.id for u in db.query(User.id).filter(User.family_id == family_id).all()]
    challenge_ids = [c.id for c in db.query(FamilyChallenge.id).filter(FamilyChallenge.family_id == family_id).all()]

    # Poradi dle cizich klicu: potomci -> rodice.
    if challenge_ids:
        db.query(ChallengeProgress).filter(ChallengeProgress.challenge_id.in_(challenge_ids)).delete(
            synchronize_session=False
        )
    if member_ids:
        db.query(ChallengeProgress).filter(ChallengeProgress.user_id.in_(member_ids)).delete(
            synchronize_session=False
        )
        db.query(PushSubscription).filter(PushSubscription.user_id.in_(member_ids)).delete(synchronize_session=False)
        db.query(RewardPurchase).filter(RewardPurchase.user_id.in_(member_ids)).delete(synchronize_session=False)
        db.query(Task).filter(Task.user_id.in_(member_ids)).update(
            {Task.parent_task_id: None}, synchronize_session=False
        )
    db.query(Task).filter(Task.offer_family_id == family_id).delete(synchronize_session=False)
    if member_ids:
        db.query(Task).filter(Task.user_id.in_(member_ids)).delete(synchronize_session=False)
    db.query(RewardWish).filter(RewardWish.family_id == family_id).delete(synchronize_session=False)
    db.query(FamilyGoal).filter(FamilyGoal.family_id == family_id).delete(synchronize_session=False)
    db.query(FamilyChallenge).filter(FamilyChallenge.family_id == family_id).delete(synchronize_session=False)
    db.query(Reward).filter(Reward.family_id == family_id).delete(synchronize_session=False)
    if member_ids:
        db.query(User).filter(User.id.in_(member_ids)).delete(synchronize_session=False)
    db.query(Family).filter(Family.id == family_id).delete(synchronize_session=False)
    db.commit()
    return {"detail": "Rodina a všechna její data byla smazána."}


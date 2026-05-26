# rewards.py - API endpointy pro odmeny

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api import get_current_user, get_db, require_role
from constants import ROLE_PARENT
from messages import REWARD_DELETED, REWARD_NOT_FOUND
from models import Reward
from schemas import MessageResponse, RewardRead

router = APIRouter(prefix="/rewards", tags=["rewards"])


def _get_reward(db: Session, reward_id: int) -> Reward:
    reward = db.query(Reward).filter(Reward.id == reward_id).first()
    if not reward:
        raise HTTPException(status_code=404, detail=REWARD_NOT_FOUND)
    return reward


def _ensure_reward_family_access(reward: Reward, family_id: int, detail: str) -> None:
    if reward.family_id != family_id:
        raise HTTPException(status_code=403, detail=detail)


class RewardCreate(BaseModel):
    name: str
    cost: int = 0
    description: str = ""


class RewardUpdate(BaseModel):
    name: str | None = None
    cost: int | None = None
    description: str | None = None


@router.get("/", summary="Seznam odmen", response_model=list[RewardRead])
def list_rewards(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not current_user.family_id:
        return []
    return db.query(Reward).filter(Reward.family_id == current_user.family_id).all()


@router.get("/{reward_id}", summary="Detail odmeny", response_model=RewardRead)
def get_reward(
    reward_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    reward = _get_reward(db, reward_id)
    _ensure_reward_family_access(reward, current_user.family_id, "Nelze zobrazit odmenu mimo rodinu.")
    return reward


@router.post("/", summary="Vytvorit odmenu", response_model=RewardRead)
def create_reward(
    reward: RewardCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    new_reward = Reward(**reward.model_dump(), family_id=current_user.family_id)
    db.add(new_reward)
    db.commit()
    db.refresh(new_reward)
    return new_reward


@router.put("/{reward_id}", summary="Upravit odmenu", response_model=RewardRead)
def update_reward(
    reward_id: int,
    reward: RewardUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    db_reward = _get_reward(db, reward_id)
    _ensure_reward_family_access(db_reward, current_user.family_id, "Nelze upravit odmenu mimo rodinu.")
    for key, value in reward.model_dump(exclude_unset=True).items():
        setattr(db_reward, key, value)
    db.commit()
    db.refresh(db_reward)
    return db_reward


@router.delete("/{reward_id}", summary="Smazat odmenu", response_model=MessageResponse)
def delete_reward(
    reward_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    db_reward = _get_reward(db, reward_id)
    _ensure_reward_family_access(db_reward, current_user.family_id, "Nelze smazat odmenu mimo rodinu.")
    db.delete(db_reward)
    db.commit()
    return {"detail": REWARD_DELETED}

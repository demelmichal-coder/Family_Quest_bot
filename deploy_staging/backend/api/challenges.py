# challenges.py - Rodinne vyzvy

import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from api import get_current_user, get_db, require_role
from constants import ROLE_CHILD, ROLE_PARENT
from models import ChallengeProgress, Family, FamilyChallenge, Task, User
from notify import send_telegram_message
from schemas import FamilyChallengeCreate, FamilyChallengeRead, MessageResponse

router = APIRouter(prefix="/challenges", tags=["challenges"])


def _get_active_challenges(db: Session, family_id: int):
    now = datetime.now(timezone.utc)
    return (
        db.query(FamilyChallenge)
        .filter(
            FamilyChallenge.family_id == family_id,
            FamilyChallenge.ends_at > now,
            FamilyChallenge.completed.is_(False),
        )
        .all()
    )


def _enrich_challenge(challenge: FamilyChallenge) -> dict:
    total = sum(p.contribution for p in challenge.progress_entries)
    d = {
        "id": challenge.id,
        "family_id": challenge.family_id,
        "title": challenge.title,
        "description": challenge.description,
        "target": challenge.target,
        "bonus_xp": challenge.bonus_xp,
        "bonus_gold": challenge.bonus_gold,
        "starts_at": challenge.starts_at,
        "ends_at": challenge.ends_at,
        "completed": challenge.completed,
        "current_progress": total,
        "progress_entries": [
            {"user_id": p.user_id, "contribution": p.contribution}
            for p in challenge.progress_entries
        ],
    }
    return d


@router.get("/", summary="Aktivni vyzvy rodiny", response_model=list[FamilyChallengeRead])
def list_challenges(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not current_user.family_id:
        return []
    challenges = _get_active_challenges(db, current_user.family_id)
    return [_enrich_challenge(c) for c in challenges]


@router.get("/all", summary="Vsechny vyzvy rodiny (vcetne dokoncench)", response_model=list[FamilyChallengeRead])
def list_all_challenges(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not current_user.family_id:
        return []
    challenges = (
        db.query(FamilyChallenge)
        .filter(FamilyChallenge.family_id == current_user.family_id)
        .order_by(FamilyChallenge.ends_at.desc())
        .limit(20)
        .all()
    )
    return [_enrich_challenge(c) for c in challenges]


@router.post("/", summary="Vytvorit novou rodinnou vyzvu", response_model=FamilyChallengeRead)
def create_challenge(
    body: FamilyChallengeCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="Uzivatel neni v rodine.")
    now = datetime.now(timezone.utc)
    challenge = FamilyChallenge(
        family_id=current_user.family_id,
        title=body.title,
        description=body.description,
        target=body.target,
        bonus_xp=body.bonus_xp,
        bonus_gold=body.bonus_gold,
        starts_at=now,
        ends_at=now + timedelta(days=body.days),
        completed=False,
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)
    return _enrich_challenge(challenge)


@router.delete("/{challenge_id}", summary="Smazat vyzvu", response_model=MessageResponse)
def delete_challenge(
    challenge_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    challenge = db.query(FamilyChallenge).filter(FamilyChallenge.id == challenge_id).first()
    if not challenge or challenge.family_id != current_user.family_id:
        raise HTTPException(status_code=404, detail="Vyzva nenalezena.")
    db.delete(challenge)
    db.commit()
    return {"detail": "Vyzva smazana."}

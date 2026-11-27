# push.py - API endpointy pro Web Push subscribe/unsubscribe

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api import get_current_user, get_db
from config import settings
from models import PushSubscription, User
from push_notify import is_valid_time, send_push_to_user_by_id

router = APIRouter(prefix="/push", tags=["push"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=1)
    keys: PushKeys


class PushUnsubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=1)


@router.get("/vapid-public-key", summary="Verejny VAPID klic pro Web Push subscribe")
def get_vapid_public_key():
    return {"publicKey": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe", summary="Prihlasit se k odberu Web Push notifikaci")
def subscribe(
    payload: PushSubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(PushSubscription).filter(PushSubscription.endpoint == payload.endpoint).first()
    if existing:
        existing.user_id = current_user.id
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
    else:
        db.add(
            PushSubscription(
                user_id=current_user.id,
                endpoint=payload.endpoint,
                p256dh=payload.keys.p256dh,
                auth=payload.keys.auth,
            )
        )
    db.commit()
    return {"detail": "Odběr notifikací zapnut."}


@router.post("/unsubscribe", summary="Odhlasit se z odberu Web Push notifikaci")
def unsubscribe(
    payload: PushUnsubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = (
        db.query(PushSubscription)
        .filter(PushSubscription.endpoint == payload.endpoint, PushSubscription.user_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Odběr nenalezen.")
    db.delete(sub)
    db.commit()
    return {"detail": "Odběr notifikací vypnut."}


@router.post("/test", summary="Poslat testovaci Web Push notifikaci na tento ucet")
def send_test_push(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = db.query(PushSubscription).filter(PushSubscription.user_id == current_user.id).count()
    if count == 0:
        raise HTTPException(status_code=404, detail="Nejdříve zapni upozornění na tomto zařízení.")
    send_push_to_user_by_id(current_user.id, "Family Quest", "Upozornění funguje!", "/", ignore_quiet=True)
    return {"detail": "Testovací upozornění odesláno."}


class QuietHours(BaseModel):
    start: str | None = None
    end: str | None = None


@router.get("/quiet-hours", summary="Tichý režim upozornění")
def get_quiet_hours(current_user: User = Depends(get_current_user)):
    return {"start": current_user.quiet_start, "end": current_user.quiet_end}


@router.put("/quiet-hours", summary="Nastavit tichý režim upozornění")
def set_quiet_hours(
    payload: QuietHours,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = (payload.start or "").strip() or None
    end = (payload.end or "").strip() or None
    if (start is None) != (end is None):
        raise HTTPException(status_code=400, detail="Vyplň začátek i konec tichého režimu, nebo obojí nech prázdné.")
    if start and (not is_valid_time(start) or not is_valid_time(end)):
        raise HTTPException(status_code=400, detail="Čas zadej ve formátu HH:MM.")
    current_user.quiet_start = start
    current_user.quiet_end = end
    db.commit()
    return {"start": start, "end": end}

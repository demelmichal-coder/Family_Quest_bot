# push_notify.py - odesilani Web Push notifikaci (nezavisle na Telegramu)

import json
import logging
import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from pywebpush import WebPushException, webpush

from config import settings
from database import SessionLocal
from models import PushSubscription, User

logger = logging.getLogger("push_notify")
APP_TIMEZONE = ZoneInfo(os.getenv("TASK_TIMEZONE", "Europe/Prague"))
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def is_valid_time(value: str | None) -> bool:
    return bool(value) and bool(_TIME_RE.match(value))


def is_quiet_now(quiet_start: str | None, quiet_end: str | None, now_local: datetime) -> bool:
    """True, pokud now_local spada do tichého rezimu. Podporuje pulnoc (napr. 21:00-07:00)."""
    if not is_valid_time(quiet_start) or not is_valid_time(quiet_end) or quiet_start == quiet_end:
        return False
    current = now_local.strftime("%H:%M")
    if quiet_start < quiet_end:
        return quiet_start <= current < quiet_end
    return current >= quiet_start or current < quiet_end


def send_push_to_users(user_ids, title: str, body: str, url: str = "/") -> None:
    """Posle stejnou notifikaci vice uzivatelum (pouziti jako BackgroundTasks)."""
    for user_id in user_ids:
        send_push_to_user_by_id(user_id, title, body, url)


def send_push_to_user_by_id(
    user_id: int, title: str, body: str, url: str = "/", ignore_quiet: bool = False
) -> None:
    """Posle Web Push vsem zarizenim daneho uzivatele. Chyby loguje, nevyhazuje vyjimku.

    Otevira si vlastni DB session, protoze bezi jako BackgroundTasks po skonceni
    puvodniho pozadavku (request-scoped session uz muze byt zavrena).
    Respektuje tichy rezim uzivatele, pokud neni ignore_quiet.
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return

    db = SessionLocal()
    try:
        if not ignore_quiet:
            owner = db.query(User).filter(User.id == user_id).first()
            if owner and is_quiet_now(owner.quiet_start, owner.quiet_end, datetime.now(APP_TIMEZONE)):
                return

        subscriptions = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
        if not subscriptions:
            return

        payload = json.dumps({"title": title, "body": body, "url": url})
        for sub in subscriptions:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=payload,
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": settings.VAPID_SUBJECT},
                )
            except WebPushException as exc:
                status_code = exc.response.status_code if exc.response is not None else None
                if status_code in (404, 410):
                    db.delete(sub)
                else:
                    logger.warning("Push notify failed (%s): %s", status_code, exc)
            except Exception as exc:
                logger.warning("Push notify exception: %s", exc)
        db.commit()
    finally:
        db.close()

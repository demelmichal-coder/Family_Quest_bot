# push_notify.py - odesilani Web Push notifikaci (nezavisle na Telegramu)

import json
import logging

from pywebpush import WebPushException, webpush

from config import settings
from database import SessionLocal
from models import PushSubscription

logger = logging.getLogger("push_notify")


def send_push_to_user_by_id(user_id: int, title: str, body: str, url: str = "/") -> None:
    """Posle Web Push vsem zarizenim daneho uzivatele. Chyby loguje, nevyhazuje vyjimku.

    Otevira si vlastni DB session, protoze bezi jako BackgroundTasks po skonceni
    puvodniho pozadavku (request-scoped session uz muze byt zavrena).
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return

    db = SessionLocal()
    try:
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

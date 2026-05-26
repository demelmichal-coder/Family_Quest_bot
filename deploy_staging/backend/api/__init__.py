import hashlib
import hmac
import json
from urllib.parse import parse_qsl

from fastapi import Depends, Header, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from constants import ROLE_PENDING
from config import settings
from database import SessionLocal
from messages import INSUFFICIENT_PERMISSIONS

from typing import Optional, Dict
from models import User


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _parse_telegram_init_data(init_data: str) -> dict[str, str]:
    return dict(parse_qsl(init_data, keep_blank_values=True))


def _validate_telegram_init_data(init_data: str) -> dict[str, object]:
    data = _parse_telegram_init_data(init_data)
    received_hash = data.pop("hash", None)
    user_raw = data.get("user")

    if not received_hash or not user_raw:
        raise HTTPException(status_code=401, detail="Chybi Telegram auth data.")
    if not settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Chybi TELEGRAM_TOKEN na backendu.")

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(data.items()))
    secret_key = hmac.new(
        key=b"WebAppData",
        msg=settings.TELEGRAM_BOT_TOKEN.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    computed_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise HTTPException(status_code=401, detail="Neplatny Telegram podpis.")

    try:
        return json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=401, detail="Neplatna Telegram user data.") from exc


def _build_default_username(telegram_user: Optional[Dict[str, object]], telegram_id: str) -> str:
    if telegram_user:
        username = str(telegram_user.get("username") or "").strip()
        if username:
            return username
        first_name = str(telegram_user.get("first_name") or "").strip()
        if first_name:
            return first_name
    return f"user_{telegram_id}"


def _get_or_create_user(
    db: Session,
    telegram_id: str,
    telegram_user: Optional[Dict[str, object]] = None,
) -> User:
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if user:
        return user

    user = User(
        telegram_id=telegram_id,
        username=_build_default_username(telegram_user, telegram_id),
        role=ROLE_PENDING,
        xp=0,
        gold=0,
    )
    db.add(user)

    try:
        db.commit()
    except IntegrityError:
        # Another request created the same Telegram user in parallel.
        db.rollback()
        user = db.query(User).filter(User.telegram_id == telegram_id).first()
        if user:
            return user
        raise

    db.refresh(user)
    return user


def get_current_user(
    telegram_init_data: Optional[str] = Header(default=None, alias="X-Telegram-Init-Data"),
    telegram_init_data_lower: Optional[str] = Header(default=None, alias="x-telegram-init-data"),
    telegram_id: Optional[str] = Header(default=None, alias="X-Telegram-Id"),
    telegram_id_lower: Optional[str] = Header(default=None, alias="x-telegram-id"),
    db: Session = Depends(get_db),
):
    import logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("telegram_auth")

    logger.info(f"X-Telegram-Init-Data: {telegram_init_data}")
    logger.info(f"X-Telegram-Id: {telegram_id}")

    resolved_telegram_id = None
    telegram_user = None

    # Prefer upper-case, fallback to lower-case if needed
    telegram_init_data_val = telegram_init_data or telegram_init_data_lower
    telegram_id_val = telegram_id or telegram_id_lower

    if telegram_init_data_val:
        try:
            logger.info(f"Validating telegram_init_data: {telegram_init_data_val}")
            telegram_user = _validate_telegram_init_data(telegram_init_data_val)
            logger.info(f"Parsed telegram_user: {telegram_user}")
            resolved_telegram_id = str(telegram_user.get("id", ""))
        except HTTPException as e:
            logger.error(f"Telegram init data validation failed: {e.detail}")
            if telegram_id_val and settings.ALLOW_INSECURE_DEMO_AUTH:
                resolved_telegram_id = telegram_id_val
            else:
                raise
    elif telegram_id_val and settings.ALLOW_INSECURE_DEMO_AUTH:
        logger.warning("Using insecure demo auth fallback.")
        resolved_telegram_id = telegram_id_val
    else:
        logger.error("Chybi overena identita uzivatele.")
        raise HTTPException(status_code=401, detail="Chybi overena identita uzivatele.")

    if not resolved_telegram_id:
        logger.error("Telegram identita je neplatna.")
        raise HTTPException(status_code=401, detail="Telegram identita je neplatna.")

    logger.info(f"Resolved telegram_id: {resolved_telegram_id}")
    return _get_or_create_user(db, resolved_telegram_id, telegram_user)


def require_role(role: str):
    def dependency(current_user=Depends(get_current_user)):
        if current_user.role != role:
            raise HTTPException(status_code=403, detail=INSUFFICIENT_PERMISSIONS)
        return current_user

    return dependency

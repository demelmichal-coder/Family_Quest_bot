import asyncio
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from alembic import command
from alembic.config import Config

os.environ.setdefault("DB_URL", f"sqlite:///{Path(tempfile.gettempdir()) / 'test_reminders_push.db'}")
os.environ.setdefault("TELEGRAM_TOKEN", "test-telegram-token")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-very-long")

BACKEND_DIR = Path(__file__).resolve().parents[1]

import scheduler
from database import SessionLocal
from models import Family, PushSubscription, Task, User

alembic_config = Config(str(BACKEND_DIR / "alembic.ini"))
alembic_config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
PRAGUE = ZoneInfo("Europe/Prague")


def _reset():
    command.upgrade(alembic_config, "head")
    db = SessionLocal()
    try:
        for model in (PushSubscription, Task, User, Family):
            db.query(model).delete()
        db.commit()
    finally:
        db.close()


def test_due_reminder_is_pushed_to_pwa_user_without_telegram():
    _reset()
    db = SessionLocal()
    try:
        family = Family(name="R", invite_code="REMIND01")
        db.add(family)
        db.flush()
        user = User(telegram_id="pwa-test-user", username="Kuba", role="child", family_id=family.id)
        db.add(user)
        db.flush()
        db.add(Task(title="Uklid", xp=5, gold=0, user_id=user.id, due_time="08:30"))
        db.commit()
        user_id = user.id
    finally:
        db.close()

    now_utc = datetime(2026, 11, 24, 8, 30, tzinfo=PRAGUE).astimezone(timezone.utc)
    with patch.object(scheduler, "send_telegram_message") as tg, \
         patch.object(scheduler, "send_push_to_user_by_id") as push:
        asyncio.run(scheduler.send_due_task_reminders(now_utc))

    tg.assert_not_called()
    push.assert_called_once()
    assert push.call_args.args[0] == user_id
    assert "Uklid" in push.call_args.args[2]

import asyncio
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

from alembic import command
from alembic.config import Config

os.environ.setdefault("DB_URL", f"sqlite:///{Path(tempfile.gettempdir()) / 'test_digest.db'}")
os.environ.setdefault("TELEGRAM_TOKEN", "test-telegram-token")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-very-long")

BACKEND_DIR = Path(__file__).resolve().parents[1]

import digest
from database import SessionLocal
from models import Family, PushSubscription, Task, User

alembic_config = Config(str(BACKEND_DIR / "alembic.ini"))
alembic_config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
PRAGUE = ZoneInfo("Europe/Prague")


def _reset():
    command.upgrade(alembic_config, "head")
    digest._sent.clear()
    db = SessionLocal()
    try:
        for model in (PushSubscription, Task, User, Family):
            db.query(model).delete()
        db.commit()
    finally:
        db.close()


def _seed(tasks_for_child=2, completed_for_child=0):
    db = SessionLocal()
    try:
        family = Family(name="Digest", invite_code="DIGEST01")
        db.add(family)
        db.flush()
        parent = User(telegram_id="pwa-parent", username="Rodic", role="parent", family_id=family.id)
        child = User(telegram_id="pwa-child", username="Kuba", role="child", family_id=family.id)
        db.add_all([parent, child])
        db.flush()
        for i in range(tasks_for_child):
            db.add(Task(title=f"Ukol {i}", xp=5, gold=0, user_id=child.id))
        for i in range(completed_for_child):
            db.add(
                Task(
                    title=f"Hotovo {i}",
                    xp=5,
                    gold=0,
                    user_id=child.id,
                    is_completed=True,
                    approved=False,
                    completed_at=datetime.now(timezone.utc) - timedelta(days=1),
                )
            )
        db.commit()
        return parent.id, child.id
    finally:
        db.close()


def _at(year, month, day, hour, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=PRAGUE).astimezone(timezone.utc)


def test_morning_digest_is_sent_once_per_day():
    _reset()
    _, child_id = _seed(tasks_for_child=2)
    send_tg = AsyncMock()
    with patch.object(digest, "send_push_to_user_by_id") as push:
        first = asyncio.run(digest.send_daily_digests(_at(2026, 11, 24, 8, 2), send_tg=send_tg))
        second = asyncio.run(digest.send_daily_digests(_at(2026, 11, 24, 8, 4), send_tg=send_tg))

    assert first == 1
    assert second == 0
    push.assert_called_once()
    assert push.call_args.args[0] == child_id
    assert "Dnes máš 2 úkoly" in push.call_args.args[2]


def test_evening_digest_only_when_tasks_pending():
    _reset()
    _seed(tasks_for_child=0)
    with patch.object(digest, "send_push_to_user_by_id") as push:
        sent = asyncio.run(digest.send_daily_digests(_at(2026, 11, 24, 19, 1), send_tg=AsyncMock()))
    assert sent == 0
    push.assert_not_called()


def test_evening_digest_reports_remaining_tasks():
    _reset()
    _seed(tasks_for_child=3)
    with patch.object(digest, "send_push_to_user_by_id") as push:
        sent = asyncio.run(digest.send_daily_digests(_at(2026, 11, 24, 19, 0), send_tg=AsyncMock()))
    assert sent == 1
    assert "Ještě ti zbývají 3 úkoly" in push.call_args.args[2]


def test_no_digest_outside_window():
    _reset()
    _seed(tasks_for_child=2)
    with patch.object(digest, "send_push_to_user_by_id") as push:
        sent = asyncio.run(digest.send_daily_digests(_at(2026, 11, 24, 12, 0), send_tg=AsyncMock()))
    assert sent == 0
    push.assert_not_called()


def test_weekly_summary_goes_to_parent_on_sunday_evening():
    _reset()
    parent_id, _ = _seed(tasks_for_child=0, completed_for_child=2)
    # 2026-11-29 je nedele
    with patch.object(digest, "send_push_to_user_by_id") as push:
        sent = asyncio.run(digest.send_weekly_parent_summaries(_at(2026, 11, 29, 18, 0), send_tg=AsyncMock()))
    assert sent == 1
    assert push.call_args.args[0] == parent_id
    body = push.call_args.args[2]
    assert "splněno 2 úkoly" in body
    assert "ke schválení 2" in body
    assert "Kuba: 2 splněno" in body


def test_weekly_summary_skipped_on_other_days():
    _reset()
    _seed(tasks_for_child=0, completed_for_child=1)
    with patch.object(digest, "send_push_to_user_by_id") as push:
        sent = asyncio.run(digest.send_weekly_parent_summaries(_at(2026, 11, 27, 18, 0), send_tg=AsyncMock()))
    assert sent == 0
    push.assert_not_called()


def test_plural_forms():
    assert digest._plural_ukol(1) == "úkol"
    assert digest._plural_ukol(3) == "úkoly"
    assert digest._plural_ukol(5) == "úkolů"
    assert digest._plural_ukol(22) == "úkolů"

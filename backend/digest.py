# digest.py - Denni prehledy pro deti a tydenni souhrn pro rodice.
# Spousti se z recurring_scheduler (scheduler.py) v lokalnim case TASK_TIMEZONE.

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from database import SessionLocal
from models import Task, User
from notify import send_telegram_message
from push_notify import send_push_to_user_by_id

logger = logging.getLogger(__name__)
APP_TIMEZONE = ZoneInfo(os.getenv("TASK_TIMEZONE", "Europe/Prague"))

MORNING_HOUR = 8
EVENING_HOUR = 19
WEEKLY_WEEKDAY = 6  # Nedele (0=Po)
WEEKLY_HOUR = 18

# Klice uz odeslanych prehledu: (datum, typ, user_id). Po restartu se vyprazdni,
# proto pro jistotu odesilame jen v dane hodinove okno (viz _in_window).
_sent: set[tuple] = set()


def _in_window(now_local: datetime, hour: int) -> bool:
    return now_local.hour == hour and now_local.minute < 10


def _prune(today) -> None:
    for key in list(_sent):
        if key[0] != today:
            _sent.discard(key)


def _pending_for_child(db: Session, child: User, today) -> list[Task]:
    tasks = db.query(Task).filter(Task.user_id == child.id, Task.is_completed.is_(False)).all()
    # Dnesni nebo bez terminu
    return [t for t in tasks if t.due_date is None or t.due_date == today]


def _plural_ukol(count: int) -> str:
    """Cesky tvar slova 'ukol' pro dany pocet: 1 ukol, 2-4 ukoly, 5+ ukolu."""
    if count == 1:
        return "úkol"
    if 2 <= count <= 4:
        return "úkoly"
    return "úkolů"


def build_morning_text(pending: list[Task]) -> str:
    titles = ", ".join(t.title for t in pending[:3])
    more = f" a dalších {len(pending) - 3}" if len(pending) > 3 else ""
    count = len(pending)
    return f"Dobré ráno! Dnes máš {count} {_plural_ukol(count)}: {titles}{more}."


def build_evening_text(pending_count: int) -> str:
    verb = "zbývají" if 2 <= pending_count <= 4 else "zbývá"
    return f"Ještě ti {verb} {pending_count} {_plural_ukol(pending_count)} na dnes. Zvládneš to!"


def build_weekly_parent_text(family_summary: dict) -> str:
    completed = family_summary["completed"]
    awaiting = family_summary["awaiting"]
    lines = [
        f"Týden v rodině: splněno {completed} {_plural_ukol(completed)}, "
        f"ke schválení {awaiting}."
    ]
    for name, done in family_summary["children"]:
        lines.append(f"{name}: {done} splněno")
    return " ".join(lines)


async def _notify(user: User, title: str, body: str, url: str = "/", send_tg=send_telegram_message) -> None:
    if user.telegram_id and not user.telegram_id.startswith("pwa-"):
        await send_tg(user.telegram_id, f"<b>{title}</b>\n{body}")
    await asyncio.to_thread(send_push_to_user_by_id, user.id, title, body, url)


async def send_daily_digests(now_utc: datetime | None = None, send_tg=send_telegram_message) -> int:
    """Rano (MORNING_HOUR) a vecer (EVENING_HOUR) posle detem prehled nesplnenych ukolu."""
    now_local = (now_utc or datetime.now(timezone.utc)).astimezone(APP_TIMEZONE)
    today = now_local.date()
    kind = None
    if _in_window(now_local, MORNING_HOUR):
        kind = "morning"
    elif _in_window(now_local, EVENING_HOUR):
        kind = "evening"
    if kind is None:
        return 0

    _prune(today)
    db: Session = SessionLocal()
    sent = 0
    try:
        children = db.query(User).filter(User.role == "child", User.family_id.isnot(None)).all()
        for child in children:
            key = (today, kind, child.id)
            if key in _sent:
                continue
            pending = _pending_for_child(db, child, today)
            if not pending:
                _sent.add(key)
                continue
            if kind == "morning":
                await _notify(child, "Family Quest", build_morning_text(pending), send_tg=send_tg)
            else:
                await _notify(child, "Family Quest", build_evening_text(len(pending)), send_tg=send_tg)
            _sent.add(key)
            sent += 1
    except Exception:
        logger.exception("Chyba pri odesilani dennich prehledu")
    finally:
        db.close()
    return sent


def collect_weekly_summary(db: Session, family_id: int, now_utc: datetime) -> dict:
    since = now_utc - timedelta(days=7)
    children = db.query(User).filter(User.family_id == family_id, User.role == "child").all()
    completed_total = 0
    awaiting_total = 0
    per_child = []
    for child in children:
        done = (
            db.query(Task)
            .filter(Task.user_id == child.id, Task.is_completed.is_(True), Task.completed_at >= since)
            .count()
        )
        awaiting = (
            db.query(Task)
            .filter(Task.user_id == child.id, Task.is_completed.is_(True), Task.approved.is_(False))
            .count()
        )
        completed_total += done
        awaiting_total += awaiting
        per_child.append((child.username or "Dítě", done))
    return {"completed": completed_total, "awaiting": awaiting_total, "children": per_child}


async def send_weekly_parent_summaries(now_utc: datetime | None = None, send_tg=send_telegram_message) -> int:
    """V nedeli vecer posle rodicum souhrn za posledni tyden."""
    now = now_utc or datetime.now(timezone.utc)
    now_local = now.astimezone(APP_TIMEZONE)
    if now_local.weekday() != WEEKLY_WEEKDAY or not _in_window(now_local, WEEKLY_HOUR):
        return 0

    today = now_local.date()
    _prune(today)
    db: Session = SessionLocal()
    sent = 0
    try:
        parents = db.query(User).filter(User.role == "parent", User.family_id.isnot(None)).all()
        summaries: dict[int, dict] = {}
        for parent in parents:
            key = (today, "weekly", parent.id)
            if key in _sent:
                continue
            if parent.family_id not in summaries:
                summaries[parent.family_id] = collect_weekly_summary(db, parent.family_id, now)
            await _notify(
                parent,
                "Family Quest – týdenní souhrn",
                build_weekly_parent_text(summaries[parent.family_id]),
                url="/",
                send_tg=send_tg,
            )
            _sent.add(key)
            sent += 1
    except Exception:
        logger.exception("Chyba pri odesilani tydennich souhrnu")
    finally:
        db.close()
    return sent

# scheduler.py - Pozadovy planovac pro opakujici se mise
# Spousteno pres FastAPI lifespan

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from database import SessionLocal
from models import Task

logger = logging.getLogger(__name__)

# Mapovani: Python weekday() -> index 0=Po, 1=Ut, ... 6=Ne
# Ale ulozeno jako CSV cisel 0-6 (0=Po)


def _should_run_today(recurrence: str, recurrence_days: str, today_weekday: int) -> bool:
    """Vraci True, pokud recurring task ma byt dnes aktivni."""
    if not recurrence:
        return False
    if recurrence == "daily":
        return True
    if recurrence == "weekly":
        # Vzdy v pondeli
        return today_weekday == 0
    if recurrence == "custom" and recurrence_days:
        try:
            days = [int(d.strip()) for d in recurrence_days.split(",")]
            return today_weekday in days
        except ValueError:
            return False
    return False


def reset_recurring_tasks():
    """Projde vsechny parent recurring tasky a vytvori nove instance na dnes."""
    db: Session = SessionLocal()
    try:
        today = datetime.now(timezone.utc)
        today_weekday = today.weekday()  # 0=Po, 6=Ne
        today_date = today.date()

        # Najdi parent recurring tasky (parent_task_id je None)
        parent_tasks = db.query(Task).filter(
            Task.recurrence.isnot(None),
            Task.parent_task_id.is_(None),
        ).all()

        created_count = 0

        for parent_task in parent_tasks:
            if not _should_run_today(parent_task.recurrence, parent_task.recurrence_days, today_weekday):
                continue

            # Zkontroluj, ze na dnes jeste neni zalozena instance
            today_instance = (
                db.query(Task)
                .filter(
                    Task.parent_task_id == parent_task.id,
                    Task.created_at >= today - timedelta(hours=1),
                )
                .first()
            )
            if today_instance:
                continue  # Uz vytvorena instance dnes

            # Vytvor novou instanci pro dnes
            new_instance = Task(
                title=parent_task.title,
                description=parent_task.description,
                xp=parent_task.xp,
                gold=parent_task.gold,
                is_daily=parent_task.is_daily,
                is_completed=False,
                approved=parent_task.approved,
                user_id=parent_task.user_id,
                parent_task_id=parent_task.id,
                recurrence=None,  # Instance nema samu recurrence
                recurrence_days=None,
                created_at=today,
            )
            db.add(new_instance)
            created_count += 1

        if created_count:
            db.commit()
            logger.info("Recurring tasks: %d novych instanci vytvoreno", created_count)
    except Exception:
        logger.exception("Chyba pri vytvarani instanci recurring ukolu")
        db.rollback()
    finally:
        db.close()


async def recurring_scheduler():
    """Bezi v pozadi, kazdy den v 00:01 UTC spusti vytvoreni novych instanci."""
    while True:
        try:
            now = datetime.now(timezone.utc)
            next_run = now.replace(hour=0, minute=1, second=0, microsecond=0) + timedelta(days=1)
            wait_seconds = (next_run - now).total_seconds()
            logger.info("Recurring scheduler: pristi vytvoreni za %.0f sekund", wait_seconds)
            await asyncio.sleep(wait_seconds)
            reset_recurring_tasks()
        except asyncio.CancelledError:
            logger.info("Recurring scheduler zastaven.")
            break
        except Exception:
            logger.exception("Chyba v recurring_scheduler")
            await asyncio.sleep(60)

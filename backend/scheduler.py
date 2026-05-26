# scheduler.py - Pozadovy planovac pro opakujici se mise
# Spousteno pres FastAPI lifespan

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from database import SessionLocal
from models import FamilyChallenge, Task, User
from notify import send_telegram_message

logger = logging.getLogger(__name__)
APP_TIMEZONE = ZoneInfo(os.getenv("TASK_TIMEZONE", "Europe/Prague"))

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


def reset_recurring_tasks(now_utc: datetime | None = None):
    """Projde vsechny parent recurring tasky a vytvori nove instance na dnes."""
    db: Session = SessionLocal()
    try:
        today = now_utc or datetime.now(timezone.utc)
        today_local = today.astimezone(APP_TIMEZONE)
        today_weekday = today_local.weekday()  # 0=Po, 6=Ne

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
                approved=False,
                user_id=parent_task.user_id,
                parent_task_id=parent_task.id,
                recurrence=None,  # Instance nema samu recurrence
                recurrence_days=None,
                created_at=today,
                due_date=today_local.date(),
                due_time=parent_task.due_time,
                last_reminded_at=None,
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


def _reminder_due(task: Task, now_local: datetime) -> bool:
    if not task.due_time or task.is_completed:
        return False
    if task.due_date and task.due_date != now_local.date():
        return False
    if task.recurrence and task.parent_task_id is None:
        return False
    due_hour, _, due_minute = task.due_time.partition(":")
    if not due_hour.isdigit() or not due_minute.isdigit():
        return False
    if now_local.hour != int(due_hour) or now_local.minute != int(due_minute):
        return False
    if task.last_reminded_at and task.last_reminded_at.astimezone(APP_TIMEZONE).date() == now_local.date():
        return False
    return True


async def send_due_task_reminders(now_utc: datetime | None = None):
    db: Session = SessionLocal()
    try:
        current_utc = now_utc or datetime.now(timezone.utc)
        now_local = current_utc.astimezone(APP_TIMEZONE)
        tasks = db.query(Task).filter(Task.due_time.isnot(None), Task.is_completed.is_(False)).all()

        sent_any = False
        for task in tasks:
            if not _reminder_due(task, now_local):
                continue
            user = db.query(User).filter(User.id == task.user_id).first()
            if not user or not user.telegram_id:
                continue
            await send_telegram_message(
                user.telegram_id,
                f"⏰ Pripominka: v {task.due_time} mas ukol <b>{task.title}</b>",
            )
            task.last_reminded_at = current_utc
            sent_any = True

        if sent_any:
            db.commit()
    except Exception:
        logger.exception("Chyba pri odesilani pripominek ukolu")
        db.rollback()
    finally:
        db.close()


def create_weekly_challenges():
    """Vytvori novou weekly challenge pro kazdy rodinne clan, ktery nema aktivni vyzvu."""
    db: Session = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        week_end = now + timedelta(days=7)
        
        # Projdi vsechny rodiny
        from models import Family
        families = db.query(Family).all()
        
        for family in families:
            # Zkontroluj, ze neexistuje aktivni challenge
            active = (
                db.query(FamilyChallenge)
                .filter(
                    FamilyChallenge.family_id == family.id,
                    FamilyChallenge.ends_at > now,
                    FamilyChallenge.completed.is_(False),
                )
                .first()
            )
            
            if active:
                continue  # Uz existuje aktivni vyzva
            
            # Vytvor novou weekly challenge
            challenge = FamilyChallenge(
                family_id=family.id,
                title="🏆 Weekly Challenge",
                description=f"Splnte spolecne ulohy a ziskejte bonus XP! Vyzva potrvava do {week_end.strftime('%a, %d.%m')}.",
                target=max(5, len(family.members) * 3),  # Cil = 3 ukoly na clena
                bonus_xp=50,  # Bonus kazdy dospely clen
                bonus_gold=0,
                starts_at=now,
                ends_at=week_end,
                completed=False,
            )
            db.add(challenge)
            logger.info("Weekly challenge vytvorena pro rodinu %d", family.id)
        
        if families:
            db.commit()
    except Exception:
        logger.exception("Chyba pri vytvarani weekly challenges")
        db.rollback()
    finally:
        db.close()


async def recurring_scheduler():
    """Bezi v pozadi, vytvari denni instance a kazdou minutu odesila pripominky."""
    last_reset_date = None
    last_weekly_challenge_date = None
    while True:
        try:
            now_utc = datetime.now(timezone.utc)
            now_local = now_utc.astimezone(APP_TIMEZONE)

            if now_local.hour == 0 and now_local.minute == 1 and last_reset_date != now_local.date():
                reset_recurring_tasks(now_utc)
                last_reset_date = now_local.date()
                
                # Vytvor weekly challenges v pondeli
                if now_local.weekday() == 0:  # Pondele (0=Po)
                    create_weekly_challenges()
                    last_weekly_challenge_date = now_local.date()

            await send_due_task_reminders(now_utc)
            wait_seconds = 60 - now_utc.second
            await asyncio.sleep(max(1, wait_seconds))
        except asyncio.CancelledError:
            logger.info("Recurring scheduler zastaven.")
            break
        except Exception:
            logger.exception("Chyba v recurring_scheduler")
            await asyncio.sleep(60)

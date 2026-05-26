# tasks.py - API endpointy pro ukoly

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from api import get_current_user, get_db, require_role
from constants import ROLE_PARENT
from messages import TASK_DELETED, TASK_NOT_FOUND
from models import Task, User
from notify import send_telegram_message
from schemas import MessageResponse, TaskCreate, TaskFeedbackWrite, TaskRead

router = APIRouter(prefix="/tasks", tags=["tasks"])
APP_TIMEZONE = ZoneInfo("Europe/Prague")


def _get_task(db: Session, task_id: int) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=TASK_NOT_FOUND)
    return task


def _get_family_assignee(db: Session, user_id: int, family_id: int) -> User:
    assignee = db.query(User).filter(User.id == user_id).first()
    if not assignee or assignee.family_id != family_id:
        raise HTTPException(status_code=403, detail="Ukol lze priradit jen clenu vlastni rodiny.")
    return assignee


def _ensure_task_family_access(task: Task, family_id: int, detail: str) -> None:
    if task.user and task.user.family_id != family_id:
        raise HTTPException(status_code=403, detail=detail)


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    xp: int | None = None
    gold: int | None = None
    user_id: int | None = None
    is_daily: bool | None = None
    is_completed: bool | None = None
    approved: bool | None = None
    due_date: date | None = None
    due_time: str | None = None
    recurrence: str | None = None
    recurrence_days: str | None = None
    requires_proof: bool | None = None
    proof_text: str | None = None
    proof_media_url: str | None = None
    ai_review_score: int | None = None
    ai_review_note: str | None = None
    ai_flagged: bool | None = None


class TaskBulkCreate(BaseModel):
    tasks: list[TaskCreate]


@router.get("/", summary="Seznam ukolu", response_model=list[TaskRead])
def list_tasks(
    due_date: date | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not current_user.family_id:
        return []
    if current_user.role == ROLE_PARENT:
        query = (
            db.query(Task)
            .join(User, Task.user_id == User.id)
            .filter(
                User.family_id == current_user.family_id,
                ~((Task.recurrence.isnot(None)) & (Task.parent_task_id.is_(None))),
            )
        )
        if due_date is not None:
            query = query.filter(Task.due_date == due_date)
        return query.all()

    today_local = datetime.now(timezone.utc).astimezone(APP_TIMEZONE).date()
    query = (
        db.query(Task)
        .filter(
            Task.user_id == current_user.id,
            ~((Task.recurrence.isnot(None)) & (Task.parent_task_id.is_(None))),
            or_(Task.due_date.is_(None), Task.due_date == today_local),
        )
    )
    if due_date is not None:
        query = query.filter(Task.due_date == due_date)
    return query.all()


@router.get("/{task_id}", summary="Detail ukolu", response_model=TaskRead)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = _get_task(db, task_id)
    if current_user.role != ROLE_PARENT and task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Nelze zobrazit cizi ukol.")
    if current_user.role == ROLE_PARENT:
        _ensure_task_family_access(task, current_user.family_id, "Nelze zobrazit ukol mimo rodinu.")
    return task


@router.post("/", summary="Vytvorit ukol", response_model=TaskRead)
def create_task(
    task: TaskCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role != ROLE_PARENT:
        task.user_id = current_user.id
    elif task.user_id is not None:
        _get_family_assignee(db, task.user_id, current_user.family_id)
    new_task = Task(**task.model_dump())
    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    # Notifikace dite
    if new_task.user_id:
        assignee = db.query(User).filter(User.id == new_task.user_id).first()
        if assignee:
            date_suffix = f" na {new_task.due_date.strftime('%d.%m.%Y')}" if new_task.due_date else ""
            due_suffix = f" v {new_task.due_time}" if new_task.due_time else ""
            msg = (
                f"🎯 Dostals novou misi: <b>{new_task.title}</b>{date_suffix}{due_suffix} "
                f"(+{new_task.xp} XP, +{new_task.gold} gold)"
            )
            background_tasks.add_task(send_telegram_message, assignee.telegram_id, msg)

    return new_task


@router.post("/bulk/create", summary="Vytvorit vice ukolu najednou", response_model=list[TaskRead])
def create_tasks_bulk(
    payload: TaskBulkCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role != ROLE_PARENT:
        raise HTTPException(status_code=403, detail="Pouze rodic muze vytvarit vice ukolu najednou.")
    
    created_tasks = []
    for task_data in payload.tasks:
        if task_data.user_id is not None:
            _get_family_assignee(db, task_data.user_id, current_user.family_id)
        new_task = Task(**task_data.model_dump())
        db.add(new_task)
        created_tasks.append(new_task)
    
    db.commit()
    for task in created_tasks:
        db.refresh(task)

    # Notifikace ditem o novych misich
    assignee_ids = {t.user_id for t in created_tasks if t.user_id}
    titles_by_user: dict[int, list[str]] = {}
    for t in created_tasks:
        if t.user_id:
            titles_by_user.setdefault(t.user_id, []).append(t.title)

    for uid, titles in titles_by_user.items():
        assignee = db.query(User).filter(User.id == uid).first()
        if assignee:
            preview = ", ".join(titles[:3])
            timed_count = sum(1 for task in created_tasks if task.user_id == uid and task.due_time)
            timed_suffix = " vcetne naplanovanych pripominek." if timed_count else "."
            msg = f"🎯 Mas {len(titles)} novych misi: <b>{preview}</b>{timed_suffix}"
            background_tasks.add_task(send_telegram_message, assignee.telegram_id, msg)

    return created_tasks


@router.put("/{task_id}", summary="Upravit ukol", response_model=TaskRead)
def update_task(
    task_id: int,
    task: TaskUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_task = _get_task(db, task_id)
    if current_user.role != ROLE_PARENT and db_task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Nelze upravit cizi ukol.")
    _ensure_task_family_access(db_task, current_user.family_id, "Nelze upravit ukol mimo rodinu.")

    updates = task.model_dump(exclude_unset=True)
    if "user_id" in updates:
        if current_user.role != ROLE_PARENT:
            raise HTTPException(status_code=403, detail="Nelze zmenit prirazeni ukolu.")
        _get_family_assignee(db, updates["user_id"], current_user.family_id)

    for key, value in updates.items():
        setattr(db_task, key, value)
    db.commit()
    db.refresh(db_task)
    return db_task


@router.delete("/{task_id}", summary="Smazat ukol", response_model=MessageResponse)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    db_task = _get_task(db, task_id)
    _ensure_task_family_access(db_task, current_user.family_id, "Nelze smazat ukol mimo rodinu.")
    db.delete(db_task)
    db.commit()
    return {"detail": TASK_DELETED}


@router.post("/{task_id}/feedback", summary="Rodic prida pochvalu ke splnenemu ukolu", response_model=TaskRead)
def add_feedback(
    task_id: int,
    body: TaskFeedbackWrite,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    db_task = _get_task(db, task_id)
    _ensure_task_family_access(db_task, current_user.family_id, "Nelze okomentovat ukol mimo rodinu.")
    if not db_task.is_completed:
        raise HTTPException(status_code=400, detail="Ukol jeste neni splneny.")
    db_task.feedback = body.feedback
    db_task.feedback_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_task)
    return db_task


@router.post("/recurring", summary="Vytvorit opakujici se ukol", response_model=TaskRead)
def create_recurring_task(
    task: TaskCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    if not task.recurrence:
        raise HTTPException(status_code=400, detail="Recurrence pole je povinne.")
    if task.user_id is not None:
        _get_family_assignee(db, task.user_id, current_user.family_id)

    parent_task = Task(**task.model_dump())
    db.add(parent_task)
    db.commit()
    db.refresh(parent_task)
    return parent_task


@router.get("/recurring", summary="Seznam opakujicich se ukolu rodiny", response_model=list[TaskRead])
def list_recurring_tasks(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    if not current_user.family_id:
        return []
    family_member_ids = [u.id for u in db.query(User.id).filter(User.family_id == current_user.family_id).all()]
    return (
        db.query(Task)
        .filter(
            Task.recurrence.isnot(None),
            Task.parent_task_id.is_(None),
            Task.user_id.in_(family_member_ids),
        )
        .all()
    )

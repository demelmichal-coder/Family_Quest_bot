import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from api import get_db, require_role
from ai.groq_client import (
    DEFAULT_REWRITE_STYLE,
    STYLE_PROMPTS,
    rewrite_reward_to_shop_item,
    rewrite_task_to_game,
)
from constants import ROLE_CHILD, ROLE_PARENT
from messages import AI_RATE_LIMITED, REWARD_TEXT_MISSING, TASK_TEXT_MISSING
from models import Task, User
from schemas import FamilyDailyPlanRequest

try:
    from core.ai import generate_ai_comment
except ModuleNotFoundError:
    generate_ai_comment = None

router = APIRouter(prefix="/ai", tags=["ai"])
AI_RATE_LIMIT_SECONDS = 1.5
_ai_request_timestamps = {}


def _check_ai_rate_limit(telegram_id: str):
    now = time.monotonic()
    last_request = _ai_request_timestamps.get(telegram_id)
    if last_request and now - last_request < AI_RATE_LIMIT_SECONDS:
        raise HTTPException(status_code=429, detail=AI_RATE_LIMITED)
    _ai_request_timestamps[telegram_id] = now


@router.post("/comment", summary="Vygeneruj AI komentar k situaci")
async def ai_comment(data: dict):
    if generate_ai_comment is None:
        raise HTTPException(status_code=501, detail="AI komentare nejsou v tomto nasazeni dostupne.")
    context = data.get("context", "")
    prompt = data.get("prompt")
    comment = generate_ai_comment(context, prompt)
    return {"comment": comment}


@router.post("/rewrite-task", summary="Prepis ukol do herniho jazyka")
async def rewrite_task(data: dict, current_user=Depends(require_role(ROLE_PARENT))):
    task_text = data.get("text")
    style = data.get("style") or DEFAULT_REWRITE_STYLE
    if not task_text:
        raise HTTPException(status_code=400, detail=TASK_TEXT_MISSING)
    if style not in STYLE_PROMPTS:
        style = DEFAULT_REWRITE_STYLE

    _check_ai_rate_limit(current_user.telegram_id)

    try:
        name, xp = await rewrite_task_to_game(task_text, style=style)
        return {"herni_nazev": name, "xp": xp, "style": style}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rewrite-reward", summary="Prepis odmenu do podoby pro obchod")
async def rewrite_reward(data: dict, current_user=Depends(require_role(ROLE_PARENT))):
    reward_text = data.get("text")
    style = data.get("style") or DEFAULT_REWRITE_STYLE
    if not reward_text:
        raise HTTPException(status_code=400, detail=REWARD_TEXT_MISSING)
    if style not in STYLE_PROMPTS:
        style = DEFAULT_REWRITE_STYLE

    _check_ai_rate_limit(current_user.telegram_id)

    try:
        name, cost = await rewrite_reward_to_shop_item(reward_text, style=style)
        return {"nazev_odmeny": name, "cost": cost, "style": style}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plan-weekly", summary="Vytvor AI plan misi na tyden")
async def plan_weekly(data: dict, current_user=Depends(require_role(ROLE_PARENT))):
    goal = str(data.get("goal") or "zodpovednost").strip()
    child_name = str(data.get("child_name") or "Dite").strip()
    mode = str(data.get("mode") or "skola").strip().lower()
    style = data.get("style") or DEFAULT_REWRITE_STYLE

    if style not in STYLE_PROMPTS:
        style = DEFAULT_REWRITE_STYLE

    _check_ai_rate_limit(current_user.telegram_id)

    if mode not in {"skola", "vikend"}:
        mode = "skola"

    templates = [
        f"{child_name}: ranni priprava a samostatnost ({goal})",
        f"{child_name}: pomoc doma po skole ({goal})",
        f"{child_name}: poriadek v pokoji ({goal})",
        f"{child_name}: pohyb nebo kreativni aktivita ({goal})",
        f"{child_name}: vecerni rutina bez pripominek ({goal})",
    ]

    if mode == "vikend":
        templates = [
            f"{child_name}: sobotni domaci mise ({goal})",
            f"{child_name}: venkovni aktivita nebo sport ({goal})",
            f"{child_name}: pomoc s varenim nebo pecenim ({goal})",
            f"{child_name}: velky uklid zony ({goal})",
            f"{child_name}: nedele - priprava na dalsi tyden ({goal})",
        ]

    planned = []
    for idx, base_text in enumerate(templates, start=1):
        try:
            title, xp = await rewrite_task_to_game(base_text, style=style)
        except Exception:
            title = f"Mise {idx}: {base_text}"
            xp = 20 + idx * 5

        planned.append(
            {
                "title": title,
                "description": base_text,
                "xp": int(max(10, min(80, xp))),
                "gold": int(max(5, min(40, xp // 2))),
                "is_daily": idx in (1, 5),
            }
        )

    return {
        "child_name": child_name,
        "goal": goal,
        "mode": mode,
        "style": style,
        "tasks": planned,
    }


@router.post("/plan-family-daily", summary="AI denni plan pro celou rodinu")
async def plan_family_daily(
    body: FamilyDailyPlanRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_PARENT)),
):
    if not current_user.family_id:
        raise HTTPException(status_code=400, detail="Uzivatel neni clenem rodiny.")

    style = body.style if body.style in STYLE_PROMPTS else DEFAULT_REWRITE_STYLE
    tasks_per_child = max(1, min(5, int(body.tasks_per_child or 3)))
    age_hints = body.age_hints or {}
    now = datetime.now(timezone.utc)
    two_weeks_ago = now - timedelta(days=14)

    _check_ai_rate_limit(current_user.telegram_id)

    children = (
        db.query(User)
        .filter(User.family_id == current_user.family_id, User.role == ROLE_CHILD)
        .all()
    )
    if not children:
        return {
            "goal": body.goal,
            "style": style,
            "tasks_per_child": tasks_per_child,
            "children": [],
        }

    templates = [
        "ranni priprava bez pripominek",
        "poradek ve svem prostoru",
        "pomoc doma podle instrukci",
        "kratsi pohybova nebo kreativni aktivita",
        "vecerni rutina vcas",
    ]

    result_children = []
    for child in children:
        completed_14d = (
            db.query(func.count(Task.id))
            .filter(
                Task.user_id == child.id,
                Task.is_completed.is_(True),
                Task.created_at >= two_weeks_ago,
            )
            .scalar()
            or 0
        )

        age_hint = age_hints.get(str(child.id))
        if age_hint is None:
            age_hint = max(6, min(16, 6 + int(completed_14d // 8)))

        history_weight = 1.0
        if completed_14d >= 24:
            history_weight = 1.35
        elif completed_14d >= 14:
            history_weight = 1.2
        elif completed_14d <= 5:
            history_weight = 0.85

        generated_tasks = []
        for idx in range(tasks_per_child):
            template = templates[idx % len(templates)]
            difficulty_hint = "lehci" if history_weight < 1 else "stredni" if history_weight < 1.3 else "narocnejsi"
            base_text = (
                f"{child.username or 'Dite'} ({age_hint} let): {template}; "
                f"cil: {body.goal}; obtiznost: {difficulty_hint}."
            )

            try:
                title, xp = await rewrite_task_to_game(base_text, style=style)
            except Exception:
                title, xp = (f"Mise: {template}", 20)

            xp_scaled = int(max(8, min(80, round(xp * history_weight))))
            generated_tasks.append(
                {
                    "title": title,
                    "description": base_text,
                    "xp": xp_scaled,
                    "gold": int(max(4, min(40, xp_scaled // 2))),
                    "is_daily": idx == 0,
                    "requires_proof": xp_scaled >= 35,
                    "user_id": child.id,
                }
            )

        result_children.append(
            {
                "user_id": child.id,
                "child_name": child.username or child.telegram_id,
                "age_hint": int(age_hint),
                "history": {
                    "completed_last_14_days": int(completed_14d),
                    "current_streak": int(child.current_streak or 0),
                    "xp_total": int(child.xp or 0),
                },
                "tasks": generated_tasks,
            }
        )

    return {
        "goal": body.goal,
        "style": style,
        "tasks_per_child": tasks_per_child,
        "children": result_children,
    }

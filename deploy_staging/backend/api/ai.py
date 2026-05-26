import time

from fastapi import APIRouter, Depends, HTTPException

from api import require_role
from ai.groq_client import (
    DEFAULT_REWRITE_STYLE,
    STYLE_PROMPTS,
    rewrite_reward_to_shop_item,
    rewrite_task_to_game,
)
from constants import ROLE_PARENT
from messages import AI_RATE_LIMITED, REWARD_TEXT_MISSING, TASK_TEXT_MISSING

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

import os
from typing import Tuple

import httpx

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_REWRITE_STYLE = "epicke"

STYLE_PROMPTS = {
    "epicke": "epicke fantasy mise pro deti",
    "vtipne": "vtipne a hrave rodinne mise pro deti",
    "kratke": "kratke, jasne a akcni mise pro deti",
}


async def rewrite_task_to_game(task_text: str, style: str = DEFAULT_REWRITE_STYLE) -> Tuple[str, int]:
    """
    Prepise ukol do herniho jazyka a priradi XP pomoci Groq API.
    Vraci tuple: (herni_nazev, xp).
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY neni nastaven.")

    style_prompt = STYLE_PROMPTS.get(style, STYLE_PROMPTS[DEFAULT_REWRITE_STYLE])
    prompt = (
        f"Prepis ukol '{task_text}' do stylu {style_prompt}. "
        "Pouzij hravy jazyk, pridej motivaci a urci pocet XP (10-50). "
        "Odpovez ve formatu: <NAZEV_MISE> | <XP>"
    )
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    data = {
        "model": "llama-3.1-8b-instant",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 60,
        "temperature": 0.8,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(GROQ_API_URL, headers=headers, json=data)
        response.raise_for_status()
        result = response.json()

    content = result["choices"][0]["message"]["content"]
    if "|" in content:
        try:
            name, xp_raw = content.split("|", 1)
            import re
            xp_match = re.search(r"\d+", xp_raw)
            xp = int(xp_match.group()) if xp_match else 20
            return name.strip().strip("*").strip(), xp
        except (ValueError, AttributeError):
            pass  # Záchrana: přejde se na default
    return content.strip(), 20


async def rewrite_reward_to_shop_item(
    reward_text: str, style: str = DEFAULT_REWRITE_STYLE
) -> Tuple[str, int]:
    """
    Prepise napad na odmenu do atraktivni podoby a navrhne cenu ve zlate.
    Vraci tuple: (nazev_odmeny, cost).
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY neni nastaven.")

    style_prompt = STYLE_PROMPTS.get(style, STYLE_PROMPTS[DEFAULT_REWRITE_STYLE])
    prompt = (
        f"Prepis odmenu '{reward_text}' do stylu {style_prompt}. "
        "Pouzij kratky, atraktivni nazev pro rodinny obchod a navrhni cenu ve zlate (1-30). "
        "Odpovez ve formatu: <NAZEV_ODMENY> | <CENA>"
    )
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    data = {
        "model": "llama-3.1-8b-instant",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 60,
        "temperature": 0.8,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(GROQ_API_URL, headers=headers, json=data)
        response.raise_for_status()
        result = response.json()

    content = result["choices"][0]["message"]["content"]
    if "|" in content:
        try:
            name, cost_raw = content.split("|", 1)
            import re
            cost_match = re.search(r"\d+", cost_raw)
            cost = int(cost_match.group()) if cost_match else 10
            return name.strip().strip("*").strip(), cost
        except (ValueError, AttributeError):
            pass  # Záchrana na default
    return content.strip(), 10
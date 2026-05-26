# notify.py - Telegram notifikace odesílané z API endpointů

import logging
import os

import httpx

logger = logging.getLogger(__name__)

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "")
_BASE = "https://api.telegram.org/bot"


async def send_telegram_message(chat_id: str, text: str) -> None:
    """Odešle Telegram zprávu danemu chat_id. Chyby loguje, nevyhazuje výjimku."""
    if not TELEGRAM_TOKEN or not chat_id:
        return

    # Demo telegram_id nemají reálný chat – přeskočíme
    if chat_id.startswith("demo-"):
        return

    url = f"{_BASE}{TELEGRAM_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(url, json=payload)
            if response.status_code != 200:
                logger.warning("Telegram notify failed %s: %s", response.status_code, response.text[:200])
    except Exception as exc:
        logger.warning("Telegram notify exception: %s", exc)

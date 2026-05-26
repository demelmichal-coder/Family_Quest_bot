import os
import requests

def generate_ai_comment(context: str, prompt: str = None) -> str:
    """
    Generate an AI-powered comment based on context (e.g., news, portfolio, etc.).
    Uses OpenAI API if available, otherwise returns a stub.
    """
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    if not OPENAI_API_KEY:
        return "[AI není nakonfigurováno]"
    if not prompt:
        prompt = f"Napiš krátký komentář k této situaci: {context}"
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-3.5-turbo",
                "messages": [
                    {"role": "system", "content": "Jsi finanční analytik. Odpovídej česky."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 120,
                "temperature": 0.7
            },
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"[AI chyba: {e}]"

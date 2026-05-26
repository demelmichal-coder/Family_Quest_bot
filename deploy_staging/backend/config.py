import os


def _parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings:
    DB_URL = os.getenv("DB_URL", "sqlite:///./familyquest.db")
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_TOKEN", "")
    ALLOWED_ORIGINS = _parse_csv(os.getenv("ALLOWED_ORIGINS", "http://localhost:5173"))
    ALLOW_INSECURE_DEMO_AUTH = os.getenv("ALLOW_INSECURE_DEMO_AUTH", "true").lower() == "true"


settings = Settings()

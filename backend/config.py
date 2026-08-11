import os
from pathlib import Path


def _parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _default_db_url() -> str:
    backend_dir = Path(__file__).resolve().parent
    db_path = backend_dir / "familyquest.db"
    return f"sqlite:///{db_path.as_posix()}"


class Settings:
    DB_URL = os.getenv("DB_URL", _default_db_url())
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_TOKEN", "")
    JWT_SECRET = os.getenv("JWT_SECRET", "")
    JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "10080"))  # 7 dní
    JWT_ISSUER = os.getenv("JWT_ISSUER", "familyquest-api")
    TELEGRAM_AUTH_MAX_AGE_SECONDS = int(os.getenv("TELEGRAM_AUTH_MAX_AGE_SECONDS", "86400"))
    ALLOWED_ORIGINS = _parse_csv(os.getenv("ALLOWED_ORIGINS", "http://localhost:5173"))
    ALLOW_INSECURE_DEMO_AUTH = os.getenv("ALLOW_INSECURE_DEMO_AUTH", "false").lower() == "true"


settings = Settings()

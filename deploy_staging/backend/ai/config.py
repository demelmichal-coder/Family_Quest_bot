import os
from dotenv import load_dotenv

# Load .env from project root
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, '.env')
if os.path.isfile(ENV_PATH):
    load_dotenv(ENV_PATH, override=True)

# Example config variables (add more as needed)
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
DB_FILE = os.getenv("DB_FILE", os.path.join(BASE_DIR, "aegis.db"))

PORT = int(os.getenv("PORT", 5000))
DEBUG = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")
sqlalchemy_db_url = os.getenv("SQLALCHEMY_DATABASE_URI", f"sqlite:///{DB_FILE}")

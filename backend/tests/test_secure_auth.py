import hashlib
import hmac
import json
import os
import tempfile
import time
from pathlib import Path
from urllib.parse import quote_plus

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

os.environ["DB_URL"] = f"sqlite:///{Path(tempfile.gettempdir()) / 'test_secure_auth.db'}"
os.environ["TELEGRAM_TOKEN"] = "test-telegram-token"
os.environ["JWT_SECRET"] = "test-jwt-secret-very-long"
os.environ["ALLOW_INSECURE_DEMO_AUTH"] = "false"

BACKEND_DIR = Path(__file__).resolve().parents[1]

from database import SessionLocal
from main import app
from models import Family, Reward, RewardPurchase, Task, User

client = TestClient(app)
alembic_config = Config(str(BACKEND_DIR / "alembic.ini"))
alembic_config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))


def reset_db():
    command.upgrade(alembic_config, "head")
    db = SessionLocal()
    try:
        db.query(RewardPurchase).delete()
        db.query(Task).delete()
        db.query(Reward).delete()
        db.query(User).delete()
        db.query(Family).delete()
        db.commit()
    finally:
        db.close()


def setup_function():
    reset_db()


def teardown_function():
    reset_db()


def build_telegram_init_data(user_payload: dict, token: str) -> str:
    encoded_user = json.dumps(user_payload, separators=(",", ":"))
    pairs = {
        "auth_date": str(int(time.time())),
        "query_id": "AAHdF6IQAAAAAN0XohDhrOrc",
        "user": encoded_user,
    }
    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(pairs.items()))
    secret_key = hmac.new(b"WebAppData", token.encode("utf-8"), hashlib.sha256).digest()
    pairs["hash"] = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return "&".join(f"{key}={quote_plus(value)}" for key, value in pairs.items())


def test_auth_join_create_verify_flow():
    init_data = build_telegram_init_data(
        {
            "id": 555001,
            "first_name": "Klara",
            "username": "klara_parent",
        },
        os.environ["TELEGRAM_TOKEN"],
    )

    auth_response = client.post("/api/auth", json={"initData": init_data})
    assert auth_response.status_code == 200
    payload = auth_response.json()
    assert payload["user"]["telegram_id"] == "555001"
    token = payload["token"]

    verify = client.get("/api/auth/verify", headers={"Authorization": f"Bearer {token}"})
    assert verify.status_code == 200
    assert verify.json()["family_id"] is None

    create_family = client.post(
        "/api/family/create",
        json={"family_name": "Nase rodina", "user_name": "Klara"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_family.status_code == 200
    created = create_family.json()
    assert created["family_name"] == "Nase rodina"
    assert created["user"]["role"] == "parent"
    assert len(created["family_code"]) == 8


def test_join_family_by_code():
    db = SessionLocal()
    try:
        family = Family(name="Test", invite_code="AB12CD34")
        db.add(family)
        db.commit()
    finally:
        db.close()

    init_data = build_telegram_init_data(
        {
            "id": 555002,
            "first_name": "Marek",
            "username": "marek_child",
        },
        os.environ["TELEGRAM_TOKEN"],
    )

    auth_response = client.post("/api/auth", json={"initData": init_data})
    token = auth_response.json()["token"]

    join = client.post(
        "/api/family/join",
        json={"family_code": "ab12cd34", "role": "child", "user_name": "Marek"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert join.status_code == 200
    payload = join.json()
    assert payload["family_code"] == "AB12CD34"
    assert payload["user"]["role"] == "child"


def test_invalid_init_data_signature_is_rejected():
    invalid = "auth_date=1999999999&query_id=x&user=%7B%22id%22%3A1%7D&hash=invalid"
    response = client.post("/api/auth", json={"initData": invalid})
    assert response.status_code == 401
    assert "Neplatny Telegram podpis" in response.json()["detail"]


def test_relogin_reuses_existing_user_and_keeps_progress():
    telegram_user = {
        "id": 777001,
        "first_name": "Ani",
        "username": "ani_child",
    }
    init_data = build_telegram_init_data(telegram_user, os.environ["TELEGRAM_TOKEN"])

    first_auth = client.post("/api/auth", json={"initData": init_data})
    assert first_auth.status_code == 200
    first_token = first_auth.json()["token"]

    create_family = client.post(
        "/api/family/create",
        json={"family_name": "Demelovi", "user_name": "Ani"},
        headers={"Authorization": f"Bearer {first_token}"},
    )
    assert create_family.status_code == 200
    family_id = create_family.json()["family_id"]

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_id == "777001").first()
        assert user is not None
        user.xp = 345
        user.gold = 210
        user.role = "child"
        db.commit()
    finally:
        db.close()

    second_auth = client.post("/api/auth", json={"initData": init_data})
    assert second_auth.status_code == 200
    second_payload = second_auth.json()

    assert second_payload["user"]["telegram_id"] == "777001"
    assert second_payload["user"]["family_id"] == family_id
    assert second_payload["user"]["role"] == "child"

    me_response = client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {second_payload['token']}"},
    )
    assert me_response.status_code == 200
    me_user = me_response.json()
    assert me_user["xp"] == 345
    assert me_user["gold"] == 210
    assert me_user["family_id"] == family_id

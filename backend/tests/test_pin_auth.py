import os
import tempfile
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

os.environ.setdefault("DB_URL", f"sqlite:///{Path(tempfile.gettempdir()) / 'test_pin_auth.db'}")
os.environ.setdefault("TELEGRAM_TOKEN", "test-telegram-token")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-very-long")
os.environ.setdefault("ALLOW_INSECURE_DEMO_AUTH", "false")

BACKEND_DIR = Path(__file__).resolve().parents[1]

from api import secure_auth
from config import settings
from database import SessionLocal
from main import app
from models import Family, PushSubscription, Reward, RewardPurchase, Task, User

client = TestClient(app)
alembic_config = Config(str(BACKEND_DIR / "alembic.ini"))
alembic_config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))


def reset_db():
    command.upgrade(alembic_config, "head")
    db = SessionLocal()
    try:
        db.query(PushSubscription).delete()
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
    settings.PIN_PEPPER = "test-pepper"
    secure_auth._family_create_attempts.clear()


def teardown_function():
    reset_db()


def _create_family(name="Mamka", pin="1234"):
    response = client.post(
        "/api/auth/pin/create-family",
        json={"family_name": "Demelovi", "name": name, "pin": pin},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_create_family_without_telegram_makes_parent_with_working_session():
    created = _create_family()
    assert created["user"]["role"] == "parent"
    assert created["user"]["telegram_id"].startswith("pwa-")
    assert len(created["family_code"]) == 8

    me = client.get("/api/users/me", headers=_auth(created["token"]))
    assert me.status_code == 200
    assert me.json()["family_id"] == created["family_id"]

    login = client.post(
        "/api/auth/pin/login",
        json={"family_code": created["family_code"], "user_id": created["user"]["id"], "pin": "1234"},
    )
    assert login.status_code == 200


def test_create_family_rejects_bad_pin_and_is_rate_limited():
    bad = client.post(
        "/api/auth/pin/create-family",
        json={"family_name": "Demelovi", "name": "Mamka", "pin": "12ab"},
    )
    assert bad.status_code == 400

    for _ in range(secure_auth.FAMILY_CREATE_LIMIT):
        _create_family()
    blocked = client.post(
        "/api/auth/pin/create-family",
        json={"family_name": "Demelovi", "name": "Mamka", "pin": "1234"},
    )
    assert blocked.status_code == 429


def test_register_with_family_code_is_always_child_even_if_parent_requested():
    created = _create_family()
    registered = client.post(
        "/api/auth/pin/register",
        json={"family_code": created["family_code"], "name": "Vetrelec", "pin": "9999", "role": "parent"},
    )
    assert registered.status_code == 200
    assert registered.json()["user"]["role"] == "child"

    forbidden = client.get("/api/users/", headers=_auth(registered.json()["token"]))
    assert forbidden.status_code == 403


def test_parent_can_promote_member_but_last_parent_cannot_be_demoted():
    created = _create_family()
    parent_headers = _auth(created["token"])
    child = client.post(
        "/api/auth/pin/register",
        json={"family_code": created["family_code"], "name": "Tatka", "pin": "5555"},
    ).json()

    self_promote = client.put(
        f"/api/users/{child['user']['id']}", json={"role": "parent"}, headers=_auth(child["token"])
    )
    assert self_promote.status_code == 403

    last_parent = client.put(
        f"/api/users/{created['user']['id']}", json={"role": "child"}, headers=parent_headers
    )
    assert last_parent.status_code == 400

    promoted = client.put(
        f"/api/users/{child['user']['id']}", json={"role": "parent"}, headers=parent_headers
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "parent"

    invalid = client.put(
        f"/api/users/{child['user']['id']}", json={"role": "admin"}, headers=parent_headers
    )
    assert invalid.status_code == 400


def test_pin_login_locks_after_repeated_failures():
    created = _create_family()
    body = {"family_code": created["family_code"], "user_id": created["user"]["id"], "pin": "0000"}
    for _ in range(secure_auth.PIN_MAX_FAILED_ATTEMPTS):
        assert client.post("/api/auth/pin/login", json=body).status_code == 401
    locked = client.post("/api/auth/pin/login", json={**body, "pin": "1234"})
    assert locked.status_code == 429


def test_family_members_lists_only_members_with_pin():
    created = _create_family()
    db = SessionLocal()
    try:
        db.add(User(telegram_id="tg-1", username="BezPinu", role="child", family_id=created["family_id"]))
        db.commit()
    finally:
        db.close()

    members = client.get(f"/api/auth/pin/family-members?family_code={created['family_code'].lower()}")
    assert members.status_code == 200
    assert [m["name"] for m in members.json()] == ["Mamka"]

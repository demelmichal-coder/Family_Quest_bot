import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

os.environ["DB_URL"] = "sqlite:///./test_familyquest.db"

BACKEND_DIR = Path(__file__).resolve().parents[1]

from database import SessionLocal
from main import app
from models import Family, User

client = TestClient(app)
alembic_config = Config(str(BACKEND_DIR / "alembic.ini"))
alembic_config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))


def reset_db():
    command.upgrade(alembic_config, "head")
    db = SessionLocal()
    try:
        db.query(User).delete()
        db.query(Family).delete()
        db.commit()
    finally:
        db.close()


def seed_family(name: str, invite_code: str):
    db = SessionLocal()
    try:
        family = Family(name=name, invite_code=invite_code)
        db.add(family)
        db.commit()
        db.refresh(family)
        return family.id
    finally:
        db.close()


def seed_user(telegram_id: str, role: str, family_id: int, xp: int, gold: int):
    db = SessionLocal()
    try:
        user = User(
            telegram_id=telegram_id,
            username=telegram_id,
            role=role,
            family_id=family_id,
            xp=xp,
            gold=gold,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.id
    finally:
        db.close()


def setup_function():
    reset_db()


def teardown_function():
    reset_db()


def test_parent_can_penalize_child():
    family_id = seed_family("Fam A", "CODEA")
    parent_id = seed_user("p1", "parent", family_id, 0, 0)
    child_id = seed_user("c1", "child", family_id, 20, 10)

    response = client.post(
        f"/users/{child_id}/penalize",
        json={"xp": 5, "gold": 3, "reason": "discipline"},
        headers={"X-Telegram-Id": "p1"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == child_id
    assert data["xp"] == 15
    assert data["gold"] == 7


def test_parent_cannot_penalize_other_family_child():
    parent_family = seed_family("Fam A", "CODEA")
    other_family = seed_family("Fam B", "CODEB")
    seed_user("p1", "parent", parent_family, 0, 0)
    child_id = seed_user("c2", "child", other_family, 20, 10)

    response = client.post(
        f"/users/{child_id}/penalize",
        json={"xp": 5, "gold": 3},
        headers={"X-Telegram-Id": "p1"},
    )

    assert response.status_code == 403


def test_parent_cannot_penalize_parent_account():
    family_id = seed_family("Fam A", "CODEA")
    seed_user("p1", "parent", family_id, 0, 0)
    parent2_id = seed_user("p2", "parent", family_id, 20, 10)

    response = client.post(
        f"/users/{parent2_id}/penalize",
        json={"xp": 5, "gold": 3},
        headers={"X-Telegram-Id": "p1"},
    )

    assert response.status_code == 400


def test_penalize_clamps_to_zero():
    family_id = seed_family("Fam A", "CODEA")
    seed_user("p1", "parent", family_id, 0, 0)
    child_id = seed_user("c1", "child", family_id, 2, 1)

    response = client.post(
        f"/users/{child_id}/penalize",
        json={"xp": 20, "gold": 10},
        headers={"X-Telegram-Id": "p1"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["xp"] == 0
    assert data["gold"] == 0


def test_penalize_requires_non_zero_values():
    family_id = seed_family("Fam A", "CODEA")
    seed_user("p1", "parent", family_id, 0, 0)
    child_id = seed_user("c1", "child", family_id, 2, 1)

    response = client.post(
        f"/users/{child_id}/penalize",
        json={"xp": 0, "gold": 0},
        headers={"X-Telegram-Id": "p1"},
    )

    assert response.status_code == 422

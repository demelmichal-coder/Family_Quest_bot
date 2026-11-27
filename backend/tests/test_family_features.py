import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

os.environ["DB_URL"] = "sqlite:///./test_familyquest.db"
os.environ["ALLOW_INSECURE_DEMO_AUTH"] = "true"
os.environ.setdefault("TELEGRAM_TOKEN", "test-telegram-token")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-very-long")

BACKEND_DIR = Path(__file__).resolve().parents[1]

import push_notify
from database import SessionLocal
from main import app
from models import (
    ChallengeProgress,
    Family,
    FamilyChallenge,
    FamilyGoal,
    PushSubscription,
    Reward,
    RewardPurchase,
    RewardWish,
    Task,
    User,
)

client = TestClient(app)
alembic_config = Config(str(BACKEND_DIR / "alembic.ini"))
alembic_config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
PRAGUE = ZoneInfo("Europe/Prague")


def reset_db():
    command.upgrade(alembic_config, "head")
    db = SessionLocal()
    try:
        for model in (
            ChallengeProgress,
            FamilyChallenge,
            PushSubscription,
            RewardWish,
            FamilyGoal,
            RewardPurchase,
            Task,
            Reward,
            User,
            Family,
        ):
            db.query(model).delete()
        db.commit()
    finally:
        db.close()


def setup_function():
    reset_db()


def teardown_function():
    reset_db()


def seed_family(name="Rodina", code="FEAT01"):
    db = SessionLocal()
    try:
        family = Family(name=name, invite_code=code)
        db.add(family)
        db.commit()
        return family.id
    finally:
        db.close()


def seed_user(telegram_id, role, username, family_id):
    db = SessionLocal()
    try:
        user = User(telegram_id=telegram_id, role=role, username=username, family_id=family_id)
        db.add(user)
        db.commit()
        return user.id
    finally:
        db.close()


def auth(telegram_id):
    return {"X-Telegram-Id": telegram_id}


def basic_family():
    family_id = seed_family()
    parent_id = seed_user("parent-1", "parent", "Máma", family_id)
    kid_id = seed_user("kid-1", "child", "Kuba", family_id)
    kid2_id = seed_user("kid-2", "child", "Anička", family_id)
    return family_id, parent_id, kid_id, kid2_id


# ---------- Přání dětí ----------

def test_child_wish_is_approved_into_a_shop_reward():
    basic_family()

    created = client.post("/wishes/", headers=auth("kid-1"), json={"title": "  Kino  ", "suggested_cost": 40})
    assert created.status_code == 200
    wish = created.json()
    assert wish["title"] == "Kino"
    assert wish["status"] == "pending"

    parent_view = client.get("/wishes/", headers=auth("parent-1")).json()
    assert [w["title"] for w in parent_view] == ["Kino"]
    assert parent_view[0]["username"] == "Kuba"
    # Sourozenec cizí přání nevidí
    assert client.get("/wishes/", headers=auth("kid-2")).json() == []

    approved = client.post(f"/wishes/{wish['id']}/approve", headers=auth("parent-1"), json={"cost": 55, "note": "Super nápad"})
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    rewards = client.get("/rewards/", headers=auth("kid-1")).json()
    assert [(r["name"], r["cost"]) for r in rewards] == [("Kino", 55)]

    # Dvakrát vyřídit nejde
    again = client.post(f"/wishes/{wish['id']}/reject", headers=auth("parent-1"), json={})
    assert again.status_code == 409


def test_wish_defaults_to_suggested_cost_and_can_be_rejected():
    basic_family()
    wish = client.post("/wishes/", headers=auth("kid-1"), json={"title": "Tablet", "suggested_cost": 900}).json()

    rejected = client.post(f"/wishes/{wish['id']}/reject", headers=auth("parent-1"), json={"note": "Je to moc"})
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["parent_note"] == "Je to moc"
    assert client.get("/rewards/", headers=auth("kid-1")).json() == []

    wish2 = client.post("/wishes/", headers=auth("kid-1"), json={"title": "Zmrzlina", "suggested_cost": 12}).json()
    approved = client.post(f"/wishes/{wish2['id']}/approve", headers=auth("parent-1"), json={})
    assert approved.status_code == 200
    assert client.get("/rewards/", headers=auth("kid-1")).json()[0]["cost"] == 12


def test_wish_permissions_and_limits():
    basic_family()
    other_family = seed_family("Cizí", "OTHER01")
    seed_user("parent-x", "parent", "Cizí rodič", other_family)

    assert client.post("/wishes/", headers=auth("parent-1"), json={"title": "Nic"}).status_code == 403
    wish = client.post("/wishes/", headers=auth("kid-1"), json={"title": "Pizza", "suggested_cost": 10}).json()

    assert client.post(f"/wishes/{wish['id']}/approve", headers=auth("kid-2"), json={}).status_code == 403
    assert client.post(f"/wishes/{wish['id']}/approve", headers=auth("parent-x"), json={}).status_code == 404
    assert client.delete(f"/wishes/{wish['id']}", headers=auth("kid-2")).status_code == 403

    for i in range(4):
        assert client.post("/wishes/", headers=auth("kid-1"), json={"title": f"Přání {i}"}).status_code == 200
    sixth = client.post("/wishes/", headers=auth("kid-1"), json={"title": "Šesté"})
    assert sixth.status_code == 400

    assert client.delete(f"/wishes/{wish['id']}", headers=auth("kid-1")).status_code == 200


# ---------- Volné úkoly ----------

def test_offer_can_be_claimed_by_only_one_child():
    _, _, kid_id, _ = basic_family()

    created = client.post("/offers/", headers=auth("parent-1"), json={"title": "Umýt auto", "xp": 30, "gold": 5})
    assert created.status_code == 200
    offer = created.json()
    assert offer["user_id"] is None

    assert [o["title"] for o in client.get("/offers/", headers=auth("kid-1")).json()] == ["Umýt auto"]
    # Volný úkol nepatří do běžného seznamu úkolů
    assert client.get("/tasks/", headers=auth("kid-1")).json() == []

    claimed = client.post(f"/offers/{offer['id']}/claim", headers=auth("kid-1"))
    assert claimed.status_code == 200
    assert claimed.json()["user_id"] == kid_id

    second = client.post(f"/offers/{offer['id']}/claim", headers=auth("kid-2"))
    assert second.status_code == 409

    assert client.get("/offers/", headers=auth("kid-2")).json() == []
    assert [t["title"] for t in client.get("/tasks/", headers=auth("kid-1")).json()] == ["Umýt auto"]


def test_offer_permissions():
    basic_family()
    other_family = seed_family("Cizí", "OTHER02")
    seed_user("kid-x", "child", "Cizí dítě", other_family)

    assert client.post("/offers/", headers=auth("kid-1"), json={"title": "Nic"}).status_code == 403
    offer = client.post("/offers/", headers=auth("parent-1"), json={"title": "Sekání"}).json()

    assert client.post(f"/offers/{offer['id']}/claim", headers=auth("kid-x")).status_code == 404
    assert client.post(f"/offers/{offer['id']}/claim", headers=auth("parent-1")).status_code == 403
    assert client.delete(f"/offers/{offer['id']}", headers=auth("kid-1")).status_code == 403
    assert client.delete(f"/offers/{offer['id']}", headers=auth("parent-1")).status_code == 200
    assert client.get("/offers/", headers=auth("kid-1")).json() == []


# ---------- Rodinný cíl ----------

def _approve_xp(child_id, xp):
    db = SessionLocal()
    try:
        db.add(
            Task(
                title="Hotovo",
                xp=xp,
                gold=0,
                user_id=child_id,
                is_completed=True,
                approved=True,
                approved_at=datetime.now(timezone.utc) + timedelta(seconds=5),
            )
        )
        db.commit()
    finally:
        db.close()


def test_family_goal_progress_and_completion():
    _, _, kid_id, kid2_id = basic_family()

    assert client.get("/goals/active", headers=auth("kid-1")).json() is None

    created = client.post("/goals/", headers=auth("parent-1"), json={"title": "Pizza večer", "target_xp": 50})
    assert created.status_code == 200
    goal = created.json()
    assert goal["progress_xp"] == 0 and goal["percent"] == 0 and goal["reached"] is False

    # Druhý aktivní cíl nejde, dokud je první otevřený
    assert client.post("/goals/", headers=auth("parent-1"), json={"title": "Další", "target_xp": 20}).status_code == 409
    assert client.post(f"/goals/{goal['id']}/complete", headers=auth("parent-1")).status_code == 400

    _approve_xp(kid_id, 30)
    _approve_xp(kid2_id, 30)
    active = client.get("/goals/active", headers=auth("kid-2")).json()
    assert active["progress_xp"] == 50  # strop na cíl
    assert active["percent"] == 100
    assert active["reached"] is True

    assert client.post(f"/goals/{goal['id']}/complete", headers=auth("kid-1")).status_code == 403
    done = client.post(f"/goals/{goal['id']}/complete", headers=auth("parent-1"))
    assert done.status_code == 200
    assert done.json()["completed_at"] is not None
    assert client.get("/goals/active", headers=auth("kid-1")).json() is None


def test_family_goal_can_be_cancelled():
    basic_family()
    goal = client.post("/goals/", headers=auth("parent-1"), json={"title": "Výlet", "target_xp": 100}).json()
    assert client.delete(f"/goals/{goal['id']}", headers=auth("kid-1")).status_code == 403
    assert client.delete(f"/goals/{goal['id']}", headers=auth("parent-1")).status_code == 200
    assert client.get("/goals/active", headers=auth("parent-1")).json() is None


# ---------- Tichý režim ----------

def test_is_quiet_now_handles_overnight_and_same_day_windows():
    def at(hour, minute=0):
        return datetime(2026, 11, 30, hour, minute, tzinfo=PRAGUE)

    # Přes půlnoc 21:00 – 07:00
    assert push_notify.is_quiet_now("21:00", "07:00", at(23, 30)) is True
    assert push_notify.is_quiet_now("21:00", "07:00", at(3)) is True
    assert push_notify.is_quiet_now("21:00", "07:00", at(7)) is False
    assert push_notify.is_quiet_now("21:00", "07:00", at(12)) is False
    # Ve stejném dni 08:00 – 14:00
    assert push_notify.is_quiet_now("08:00", "14:00", at(9)) is True
    assert push_notify.is_quiet_now("08:00", "14:00", at(14)) is False
    # Vypnuto / neplatné
    assert push_notify.is_quiet_now(None, None, at(3)) is False
    assert push_notify.is_quiet_now("21:00", "21:00", at(21)) is False
    assert push_notify.is_quiet_now("25:00", "07:00", at(3)) is False


def test_quiet_hours_api_validation_and_storage():
    basic_family()
    assert client.get("/push/quiet-hours", headers=auth("kid-1")).json() == {"start": None, "end": None}

    ok = client.put("/push/quiet-hours", headers=auth("kid-1"), json={"start": "21:00", "end": "07:00"})
    assert ok.status_code == 200
    assert client.get("/push/quiet-hours", headers=auth("kid-1")).json() == {"start": "21:00", "end": "07:00"}

    assert client.put("/push/quiet-hours", headers=auth("kid-1"), json={"start": "21:00"}).status_code == 400
    assert client.put("/push/quiet-hours", headers=auth("kid-1"), json={"start": "9pm", "end": "7am"}).status_code == 400

    off = client.put("/push/quiet-hours", headers=auth("kid-1"), json={"start": None, "end": None})
    assert off.status_code == 200
    assert client.get("/push/quiet-hours", headers=auth("kid-1")).json() == {"start": None, "end": None}


def test_push_is_skipped_during_quiet_hours_but_not_when_ignored():
    _, _, kid_id, _ = basic_family()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == kid_id).first()
        user.quiet_start, user.quiet_end = "00:00", "23:59"
        db.add(PushSubscription(user_id=kid_id, endpoint="https://push.example/1", p256dh="k", auth="a"))
        db.commit()
    finally:
        db.close()

    fake_settings = SimpleNamespace(VAPID_PRIVATE_KEY="priv", VAPID_PUBLIC_KEY="pub", VAPID_SUBJECT="mailto:x@example.com")
    with patch.object(push_notify, "settings", fake_settings), patch.object(push_notify, "webpush") as sender:
        push_notify.send_push_to_user_by_id(kid_id, "T", "B")
        sender.assert_not_called()
        push_notify.send_push_to_user_by_id(kid_id, "T", "B", ignore_quiet=True)
        sender.assert_called_once()


# ---------- Export a smazání rodiny ----------

def test_parent_can_export_family_data_without_secrets():
    _, _, kid_id, _ = basic_family()
    db = SessionLocal()
    try:
        db.add(Task(title="Úkol", xp=5, gold=1, user_id=kid_id, proof_media_url="data:image/png;base64,AAAA"))
        db.commit()
    finally:
        db.close()

    assert client.get("/families/me/export", headers=auth("kid-1")).status_code == 403

    response = client.get("/families/me/export", headers=auth("parent-1"))
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    data = response.json()
    assert data["family"]["name"] == "Rodina"
    assert {m["username"] for m in data["members"]} == {"Máma", "Kuba", "Anička"}
    assert data["tasks"][0]["has_proof_photo"] is True
    assert "pin_hash" not in response.text
    assert "AAAA" not in response.text  # fotky se do exportu nevkládají


def test_family_deletion_requires_confirmation_and_keeps_other_families():
    _, _, kid_id, _ = basic_family()
    other_family = seed_family("Cizí", "OTHER03")
    seed_user("parent-x", "parent", "Cizí rodič", other_family)
    db = SessionLocal()
    try:
        db.add(Task(title="Úkol", xp=5, gold=1, user_id=kid_id))
        db.add(Reward(name="Odměna", cost=3, family_id=1))
        db.commit()
    finally:
        db.close()
    client.post("/wishes/", headers=auth("kid-1"), json={"title": "Pizza"})
    client.post("/offers/", headers=auth("parent-1"), json={"title": "Volný"})
    client.post("/goals/", headers=auth("parent-1"), json={"title": "Cíl", "target_xp": 50})

    assert client.post("/families/me/delete", headers=auth("kid-1"), json={"confirm": "SMAZAT RODINU"}).status_code == 403
    assert client.post("/families/me/delete", headers=auth("parent-1"), json={"confirm": "smazat"}).status_code == 400

    done = client.post("/families/me/delete", headers=auth("parent-1"), json={"confirm": "SMAZAT RODINU"})
    assert done.status_code == 200

    db = SessionLocal()
    try:
        assert db.query(Family).filter(Family.name == "Rodina").count() == 0
        assert db.query(User).filter(User.telegram_id.in_(["parent-1", "kid-1", "kid-2"])).count() == 0
        assert db.query(Task).count() == 0
        assert db.query(RewardWish).count() == 0
        assert db.query(FamilyGoal).count() == 0
        assert db.query(Reward).count() == 0
        # Cizí rodina zůstala
        assert db.query(Family).filter(Family.name == "Cizí").count() == 1
        assert db.query(User).filter(User.telegram_id == "parent-x").count() == 1
    finally:
        db.close()

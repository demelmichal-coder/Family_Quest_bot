import hashlib
import hmac
import json
import os
import time
from datetime import date, timedelta
from urllib.parse import quote_plus
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

os.environ["DB_URL"] = "sqlite:///./test_familyquest.db"

BACKEND_DIR = Path(__file__).resolve().parents[1]

from config import settings
from database import SessionLocal
from api import _get_or_create_user
import api.ai as ai_api
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


def build_telegram_init_data(user_payload: dict, token: str) -> str:
    encoded_user = json.dumps(user_payload, separators=(",", ":"))
    pairs = {
        "auth_date": "1710000000",
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


def seed_family(name: str = "Test family", invite_code: str = "ABC123"):
    db = SessionLocal()
    try:
        family = Family(name=name, invite_code=invite_code)
        db.add(family)
        db.commit()
        db.refresh(family)
        return family.id
    finally:
        db.close()


def seed_user(
    telegram_id: str,
    role: str,
    username: str,
    xp: int = 0,
    gold: int = 0,
    family_id: int | None = None,
):
    db = SessionLocal()
    try:
        user = User(
            telegram_id=telegram_id,
            role=role,
            username=username,
            xp=xp,
            gold=gold,
            family_id=family_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.id
    finally:
        db.close()


def seed_task(
    user_id: int,
    title: str,
    *,
    xp: int = 15,
    gold: int = 3,
    is_daily: bool = True,
    approved: bool = False,
    due_date: date | None = None,
):
    db = SessionLocal()
    try:
        task = Task(
            title=title,
            user_id=user_id,
            xp=xp,
            gold=gold,
            is_daily=is_daily,
            approved=approved,
            due_date=due_date,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task.id
    finally:
        db.close()


def seed_reward(name: str, cost: int, description: str = "", family_id: int | None = None):
    db = SessionLocal()
    try:
        reward = Reward(name=name, cost=cost, description=description, family_id=family_id)
        db.add(reward)
        db.commit()
        db.refresh(reward)
        return reward.id
    finally:
        db.close()


def setup_function():
    reset_db()
    ai_api._ai_request_timestamps.clear()


def teardown_function():
    reset_db()
    ai_api._ai_request_timestamps.clear()


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert "zprava" in r.json()


def test_live_health():
    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ready_health():
    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ai_rewrite_task_requires_text():
    seed_user("admin-1", "parent", "Parent")
    response = client.post("/ai/rewrite-task", json={}, headers={"X-Telegram-Id": "admin-1"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Chybi text ukolu."


def test_ai_rewrite_task_returns_rewritten_task(monkeypatch):
    async def fake_rewrite_task_to_game(task_text, style="epicke"):
        assert task_text == "Uklid pokoj"
        assert style == "epicke"
        return "Vyprava za cistym pokojem", 25

    monkeypatch.setattr("api.ai.rewrite_task_to_game", fake_rewrite_task_to_game)
    seed_user("admin-1", "parent", "Parent")

    response = client.post(
        "/ai/rewrite-task",
        json={"text": "Uklid pokoj"},
        headers={"X-Telegram-Id": "admin-1"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "herni_nazev": "Vyprava za cistym pokojem",
        "xp": 25,
        "style": "epicke",
    }


def test_ai_rewrite_task_accepts_custom_style(monkeypatch):
    async def fake_rewrite_task_to_game(task_text, style="epicke"):
        assert task_text == "Nakrm kocku"
        assert style == "vtipne"
        return "Mise granule", 14

    monkeypatch.setattr("api.ai.rewrite_task_to_game", fake_rewrite_task_to_game)
    seed_user("admin-1", "parent", "Parent")

    response = client.post(
        "/ai/rewrite-task",
        json={"text": "Nakrm kocku", "style": "vtipne"},
        headers={"X-Telegram-Id": "admin-1"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "herni_nazev": "Mise granule",
        "xp": 14,
        "style": "vtipne",
    }


def test_ai_rewrite_task_returns_error_when_groq_client_fails(monkeypatch):
    async def failing_rewrite_task_to_game(task_text, style="epicke"):
        raise RuntimeError("Groq service down")

    monkeypatch.setattr("api.ai.rewrite_task_to_game", failing_rewrite_task_to_game)
    seed_user("admin-1", "parent", "Parent")

    response = client.post(
        "/ai/rewrite-task",
        json={"text": "Nakrm kocku"},
        headers={"X-Telegram-Id": "admin-1"},
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Groq service down"


def test_ai_rewrite_reward_requires_text():
    seed_user("admin-1", "parent", "Parent")
    response = client.post("/ai/rewrite-reward", json={}, headers={"X-Telegram-Id": "admin-1"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Chybi text odmeny."


def test_ai_rewrite_reward_returns_suggested_shop_item(monkeypatch):
    async def fake_rewrite_reward_to_shop_item(reward_text, style="epicke"):
        assert reward_text == "Vecer s filmem a popcornem"
        assert style == "vtipne"
        return "Kombo popcorn", 9

    monkeypatch.setattr("api.ai.rewrite_reward_to_shop_item", fake_rewrite_reward_to_shop_item)
    seed_user("admin-1", "parent", "Parent")

    response = client.post(
        "/ai/rewrite-reward",
        json={"text": "Vecer s filmem a popcornem", "style": "vtipne"},
        headers={"X-Telegram-Id": "admin-1"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "nazev_odmeny": "Kombo popcorn",
        "cost": 9,
        "style": "vtipne",
    }


def test_ai_rewrite_requires_parent_role():
    seed_user("player-1", "child", "Kid")

    response = client.post(
        "/ai/rewrite-task",
        json={"text": "Uklid pokoj"},
        headers={"X-Telegram-Id": "player-1"},
    )

    assert response.status_code == 403


def test_ai_rewrite_rate_limit_blocks_fast_retries(monkeypatch):
    async def fake_rewrite_task_to_game(task_text, style="epicke"):
        return "Mise", 10

    monkeypatch.setattr("api.ai.rewrite_task_to_game", fake_rewrite_task_to_game)
    seed_user("admin-1", "parent", "Parent")
    ai_api._ai_request_timestamps["admin-1"] = time.monotonic()

    response = client.post(
        "/ai/rewrite-task",
        json={"text": "Uklid pokoj"},
        headers={"X-Telegram-Id": "admin-1"},
    )

    assert response.status_code == 429
    assert "prilis rychle" in response.json()["detail"].lower()


def test_get_current_user():
    seed_user("player-1", "child", "Kid")

    r = client.get("/users/me", headers={"X-Telegram-Id": "player-1"})

    assert r.status_code == 200
    assert r.json()["telegram_id"] == "player-1"
    assert r.json()["role"] == "child"


def test_missing_auth_header_is_rejected_when_demo_auth_disabled():
    original_flag = settings.ALLOW_INSECURE_DEMO_AUTH
    settings.ALLOW_INSECURE_DEMO_AUTH = False
    try:
        response = client.get("/users/me")
    finally:
        settings.ALLOW_INSECURE_DEMO_AUTH = original_flag

    assert response.status_code == 401


def test_signed_telegram_init_data_is_accepted():
    original_flag = settings.ALLOW_INSECURE_DEMO_AUTH
    original_token = settings.TELEGRAM_BOT_TOKEN
    settings.ALLOW_INSECURE_DEMO_AUTH = False
    settings.TELEGRAM_BOT_TOKEN = "test-bot-token"
    seed_user("777", "child", "Signed Kid")
    init_data = build_telegram_init_data(
        {"id": 777, "first_name": "Signed", "username": "signed_kid"},
        settings.TELEGRAM_BOT_TOKEN,
    )
    try:
        response = client.get("/users/me", headers={"X-Telegram-Init-Data": init_data})
    finally:
        settings.ALLOW_INSECURE_DEMO_AUTH = original_flag
        settings.TELEGRAM_BOT_TOKEN = original_token

    assert response.status_code == 200
    assert response.json()["telegram_id"] == "777"


def test_signed_telegram_init_data_creates_missing_user():
    original_flag = settings.ALLOW_INSECURE_DEMO_AUTH
    original_token = settings.TELEGRAM_BOT_TOKEN
    settings.ALLOW_INSECURE_DEMO_AUTH = False
    settings.TELEGRAM_BOT_TOKEN = "test-bot-token"
    init_data = build_telegram_init_data(
        {"id": 888, "first_name": "Nova", "username": "nova_kid"},
        settings.TELEGRAM_BOT_TOKEN,
    )
    try:
        response = client.get("/users/me", headers={"X-Telegram-Init-Data": init_data})
    finally:
        settings.ALLOW_INSECURE_DEMO_AUTH = original_flag
        settings.TELEGRAM_BOT_TOKEN = original_token

    assert response.status_code == 200
    assert response.json()["telegram_id"] == "888"
    assert response.json()["username"] == "nova_kid"
    assert response.json()["role"] == "pending"


def test_get_or_create_user_recovers_from_parallel_insert(monkeypatch):
    seed_user("race-user", "pending", "Existing")
    db = SessionLocal()
    original_commit = db.commit
    commit_calls = {"count": 0}

    def racing_commit():
        commit_calls["count"] += 1
        if commit_calls["count"] == 1:
            raise IntegrityError("insert", {}, Exception("duplicate"))
        return original_commit()

    monkeypatch.setattr(db, "commit", racing_commit)
    try:
        user = _get_or_create_user(
            db,
            "race-user",
            {"id": "race-user", "username": "ignored_after_race"},
        )
    finally:
        db.close()

    assert user.telegram_id == "race-user"
    assert user.username == "Existing"


def test_player_only_sees_own_tasks():
    family_id = seed_family()
    owner_id = seed_user("player-1", "child", "Kid", family_id=family_id)
    other_id = seed_user("player-2", "child", "Other", family_id=family_id)
    seed_task(owner_id, "Clean room")
    seed_task(other_id, "Homework")

    r = client.get("/tasks/", headers={"X-Telegram-Id": "player-1"})

    assert r.status_code == 200
    payload = r.json()
    assert len(payload) == 1
    assert payload[0]["title"] == "Clean room"


def test_parent_can_create_task_for_child_in_same_family():
    family_id = seed_family()
    child_id = seed_user("player-1", "child", "Kid", family_id=family_id)
    seed_user("admin-1", "parent", "Parent", family_id=family_id)

    response = client.post(
        "/tasks/",
        headers={"X-Telegram-Id": "admin-1"},
        json={
            "title": "Read a chapter",
            "description": "Book time",
            "xp": 20,
            "gold": 5,
            "is_daily": False,
            "user_id": child_id,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "Read a chapter"
    assert payload["user_id"] == child_id


def test_parent_can_create_task_for_specific_day():
    family_id = seed_family()
    child_id = seed_user("player-1", "child", "Kid", family_id=family_id)
    seed_user("admin-1", "parent", "Parent", family_id=family_id)

    response = client.post(
        "/tasks/",
        headers={"X-Telegram-Id": "admin-1"},
        json={
            "title": "Specific day mission",
            "description": "Calendar task",
            "xp": 12,
            "gold": 2,
            "is_daily": False,
            "user_id": child_id,
            "due_date": "2026-05-30",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "Specific day mission"
    assert payload["due_date"] == "2026-05-30"


def test_parent_cannot_assign_task_to_other_family_member():
    family_a = seed_family("Family A", "AAA111")
    family_b = seed_family("Family B", "BBB222")
    outsider_id = seed_user("player-2", "child", "Other", family_id=family_b)
    seed_user("admin-1", "parent", "Parent", family_id=family_a)

    response = client.post(
        "/tasks/",
        headers={"X-Telegram-Id": "admin-1"},
        json={
            "title": "Invalid assignment",
            "description": "",
            "xp": 10,
            "gold": 1,
            "is_daily": False,
            "user_id": outsider_id,
        },
    )

    assert response.status_code == 403
    assert "vlastni rodiny" in response.json()["detail"]


def test_parent_can_update_and_delete_task_in_family():
    family_id = seed_family()
    child_id = seed_user("player-1", "child", "Kid", family_id=family_id)
    seed_user("admin-1", "parent", "Parent", family_id=family_id)
    task_id = seed_task(child_id, "Old task", xp=5, gold=1)

    update_response = client.put(
        f"/tasks/{task_id}",
        headers={"X-Telegram-Id": "admin-1"},
        json={"title": "Updated task", "gold": 9},
    )

    assert update_response.status_code == 200
    assert update_response.json()["title"] == "Updated task"
    assert update_response.json()["gold"] == 9

    delete_response = client.delete(
        f"/tasks/{task_id}",
        headers={"X-Telegram-Id": "admin-1"},
    )

    assert delete_response.status_code == 200
    assert "smazan" in delete_response.json()["detail"].lower()


def test_child_does_not_see_tasks_from_previous_day():
    family_id = seed_family()
    child_id = seed_user("player-1", "child", "Kid", family_id=family_id)
    yesterday = date.today() - timedelta(days=1)
    today = date.today()
    seed_task(child_id, "Old mission", is_daily=False, due_date=yesterday)
    seed_task(child_id, "Today mission", is_daily=False, due_date=today)

    response = client.get("/tasks/", headers={"X-Telegram-Id": "player-1"})

    assert response.status_code == 200
    payload = response.json()
    titles = [task["title"] for task in payload]
    assert "Today mission" in titles
    assert "Old mission" not in titles


def test_child_cannot_complete_task_from_previous_day():
    family_id = seed_family()
    child_id = seed_user("player-1", "child", "Kid", family_id=family_id)
    task_id = seed_task(
        child_id,
        "Expired mission",
        is_daily=False,
        due_date=date.today() - timedelta(days=1),
    )

    response = client.post(f"/game/complete-task/{task_id}", headers={"X-Telegram-Id": "player-1"})

    assert response.status_code == 400
    assert "jen v den" in response.json()["detail"]


def test_user_can_create_family_and_become_parent():
    seed_user("player-1", "pending", "Nova")

    response = client.post(
        "/families/create",
        headers={"X-Telegram-Id": "player-1"},
        json={"name": "Nova Family", "username": "NovaParent"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == "parent"
    assert payload["family_id"] is not None
    assert payload["username"] == "NovaParent"


def test_user_can_join_family_as_child():
    family_id = seed_family("Quest Crew", "JOIN42")
    seed_user("player-1", "pending", "Nova")

    response = client.post(
        "/families/join",
        headers={"X-Telegram-Id": "player-1"},
        json={"invite_code": "join42", "role": "child", "username": "QuestKid"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["family_id"] == family_id
    assert payload["role"] == "child"
    assert payload["username"] == "QuestKid"


def test_get_my_family_returns_members():
    family_id = seed_family("Quest Crew", "JOIN42")
    seed_user("admin-1", "parent", "Parent", family_id=family_id)
    seed_user("player-1", "child", "Kid", family_id=family_id)

    response = client.get("/families/me", headers={"X-Telegram-Id": "admin-1"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "Quest Crew"
    assert len(payload["members"]) == 2


def test_parent_can_create_user_in_own_family():
    family_id = seed_family()
    seed_user("admin-1", "parent", "Parent", family_id=family_id)

    response = client.post(
        "/users/",
        headers={"X-Telegram-Id": "admin-1"},
        json={
            "telegram_id": "player-3",
            "username": "FreshKid",
            "role": "child",
            "xp": 12,
            "gold": 4,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["telegram_id"] == "player-3"
    assert payload["family_id"] == family_id
    assert payload["role"] == "child"


def test_child_cannot_view_user_from_other_family():
    family_a = seed_family("Family A", "AAA111")
    family_b = seed_family("Family B", "BBB222")
    outsider_id = seed_user("player-2", "child", "Other", family_id=family_b)
    seed_user("player-1", "child", "Kid", family_id=family_a)

    response = client.get(
        f"/users/{outsider_id}",
        headers={"X-Telegram-Id": "player-1"},
    )

    assert response.status_code == 403
    assert "mimo rodinu" in response.json()["detail"]


def test_child_cannot_promote_self_or_grant_rewards():
    family_id = seed_family()
    user_id = seed_user("player-1", "child", "Kid", xp=5, gold=1, family_id=family_id)

    response = client.put(
        f"/users/{user_id}",
        headers={"X-Telegram-Id": "player-1"},
        json={"role": "parent", "xp": 999, "gold": 999},
    )

    assert response.status_code == 403
    assert "profilove udaje" in response.json()["detail"]


def test_parent_cannot_delete_user_from_other_family():
    family_a = seed_family("Family A", "AAA111")
    family_b = seed_family("Family B", "BBB222")
    outsider_id = seed_user("player-2", "child", "Other", family_id=family_b)
    seed_user("admin-1", "parent", "Parent", family_id=family_a)

    response = client.delete(
        f"/users/{outsider_id}",
        headers={"X-Telegram-Id": "admin-1"},
    )

    assert response.status_code == 403
    assert "mimo rodinu" in response.json()["detail"]


def test_parent_can_create_update_and_delete_reward_in_family():
    family_id = seed_family()
    seed_user("admin-1", "parent", "Parent", family_id=family_id)

    create_response = client.post(
        "/rewards/",
        headers={"X-Telegram-Id": "admin-1"},
        json={"name": "Cinema", "description": "Family evening", "cost": 12},
    )

    assert create_response.status_code == 200
    reward_id = create_response.json()["id"]
    assert create_response.json()["name"] == "Cinema"

    update_response = client.put(
        f"/rewards/{reward_id}",
        headers={"X-Telegram-Id": "admin-1"},
        json={"cost": 15},
    )

    assert update_response.status_code == 200
    assert update_response.json()["cost"] == 15

    delete_response = client.delete(
        f"/rewards/{reward_id}",
        headers={"X-Telegram-Id": "admin-1"},
    )

    assert delete_response.status_code == 200
    assert "smazana" in delete_response.json()["detail"].lower()


def test_child_cannot_access_reward_from_other_family():
    family_a = seed_family("Family A", "AAA111")
    family_b = seed_family("Family B", "BBB222")
    reward_id = seed_reward("Secret reward", 4, family_id=family_b)
    seed_user("player-1", "child", "Kid", family_id=family_a)

    response = client.get(
        f"/rewards/{reward_id}",
        headers={"X-Telegram-Id": "player-1"},
    )

    assert response.status_code == 403
    assert "mimo rodinu" in response.json()["detail"]


def test_player_can_complete_approved_task_and_get_rewards():
    family_id = seed_family()
    player_id = seed_user("player-1", "child", "Kid", xp=10, gold=2, family_id=family_id)
    task_id = seed_task(player_id, "Take out trash", xp=25, gold=4, is_daily=False, approved=True)

    r = client.post(f"/game/complete-task/{task_id}", headers={"X-Telegram-Id": "player-1"})

    assert r.status_code == 200
    body = r.json()
    assert body["task"]["is_completed"] is True
    assert body["user"]["xp"] == 35
    assert body["user"]["gold"] == 6


def test_player_cannot_complete_unapproved_special_task():
    family_id = seed_family()
    player_id = seed_user("player-1", "child", "Kid", family_id=family_id)
    task_id = seed_task(player_id, "Secret quest", is_daily=False, approved=False)

    r = client.post(f"/game/complete-task/{task_id}", headers={"X-Telegram-Id": "player-1"})

    assert r.status_code == 200
    assert "schvaleni" in r.json()["detail"].lower()
    assert r.json()["task"]["is_completed"] is True
    assert r.json()["task"]["approved"] is False


def test_parent_can_approve_special_task():
    family_id = seed_family()
    player_id = seed_user("player-1", "child", "Kid", family_id=family_id)
    seed_user("admin-1", "parent", "Parent", family_id=family_id)
    task_id = seed_task(player_id, "Extra reading", is_daily=False, approved=False)

    complete = client.post(f"/game/complete-task/{task_id}", headers={"X-Telegram-Id": "player-1"})
    assert complete.status_code == 200

    r = client.post(f"/game/approve-task/{task_id}", headers={"X-Telegram-Id": "admin-1"})

    assert r.status_code == 200
    assert "schvalen" in r.json()["detail"]


def test_parent_cannot_approve_before_child_completion():
    family_id = seed_family()
    player_id = seed_user("player-1", "child", "Kid", family_id=family_id)
    seed_user("admin-1", "parent", "Parent", family_id=family_id)
    task_id = seed_task(player_id, "Extra reading", is_daily=False, approved=False)

    r = client.post(f"/game/approve-task/{task_id}", headers={"X-Telegram-Id": "admin-1"})

    assert r.status_code == 400
    assert "oznacen" in r.json()["detail"].lower() or "splneny" in r.json()["detail"].lower()


def test_player_can_buy_reward_and_get_purchase_history():
    family_id = seed_family()
    seed_user("player-1", "child", "Kid", gold=20, family_id=family_id)
    reward_id = seed_reward("Movie night", 7, "Vyber filmu s popcornem", family_id=family_id)

    purchase_response = client.post(
        f"/game/buy-reward/{reward_id}",
        headers={"X-Telegram-Id": "player-1"},
    )

    assert purchase_response.status_code == 200
    body = purchase_response.json()
    assert body["user"]["gold"] == 13
    assert body["purchase"]["reward_name"] == "Movie night"

    history_response = client.get(
        "/game/purchase-history",
        headers={"X-Telegram-Id": "player-1"},
    )

    assert history_response.status_code == 200
    history = history_response.json()
    assert len(history) == 1
    assert history[0]["reward_name"] == "Movie night"


def test_player_cannot_buy_reward_without_gold():
    family_id = seed_family()
    seed_user("player-1", "child", "Kid", gold=3, family_id=family_id)
    reward_id = seed_reward("Ice cream", 5, family_id=family_id)

    response = client.post(
        f"/game/buy-reward/{reward_id}",
        headers={"X-Telegram-Id": "player-1"},
    )

    assert response.status_code == 400
    assert "zlata" in response.json()["detail"].lower()


def test_family_leaderboard_returns_ranked_family_members():
    family_id = seed_family()
    seed_user("player-1", "child", "Kid", xp=30, gold=4, family_id=family_id)
    seed_user("player-2", "child", "Other", xp=60, gold=1, family_id=family_id)
    seed_user("admin-1", "parent", "Parent", xp=50, gold=9, family_id=family_id)

    response = client.get("/game/leaderboard", headers={"X-Telegram-Id": "player-1"})

    assert response.status_code == 200
    payload = response.json()
    assert [entry["username"] for entry in payload] == ["Other", "Parent", "Kid"]
    assert [entry["rank"] for entry in payload] == [1, 2, 3]
    assert payload[2]["is_me"] is True


def test_family_stats_aggregates_family_data():
    family_id = seed_family()
    parent_id = seed_user("admin-1", "parent", "Parent", xp=20, gold=10, family_id=family_id)
    child_id = seed_user("player-1", "child", "Kid", xp=35, gold=7, family_id=family_id)
    seed_task(child_id, "Daily cleanup", is_daily=True, approved=True)
    special_task_id = seed_task(child_id, "Special quest", is_daily=False, approved=False)
    reward_id = seed_reward("Movie night", 5, family_id=family_id)

    client.post(f"/game/complete-task/{special_task_id}", headers={"X-Telegram-Id": "player-1"})
    client.post(f"/game/approve-task/{special_task_id}", headers={"X-Telegram-Id": "admin-1"})
    client.post(f"/game/buy-reward/{reward_id}", headers={"X-Telegram-Id": "player-1"})

    response = client.get("/game/family-stats", headers={"X-Telegram-Id": "admin-1"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["members"] == 2
    assert payload["children"] == 1
    assert payload["total_xp"] == 70
    assert payload["completed_tasks"] == 2
    assert payload["daily_tasks"] == 1
    assert payload["rewards"] == 1

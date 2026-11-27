import os
import tempfile
from pathlib import Path

os.environ.setdefault("DB_URL", f"sqlite:///{Path(tempfile.gettempdir()) / 'test_proof_scoring.db'}")
os.environ.setdefault("TELEGRAM_TOKEN", "test-telegram-token")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-very-long")

from api.game import _fold, _score_task_proof
from models import Task


def test_fold_removes_diacritics_and_lowercases():
    assert _fold("Splněno, ÚKOL Dokončil") == "splneno, ukol dokoncil"
    assert _fold("") == ""


def test_proof_scoring_is_the_same_with_and_without_diacritics():
    task = Task(title="Uklidit pokoj", description="Podlaha a postel")
    with_diacritics = _score_task_proof(task, "Pokoj jsem uklidil, podlaha je čistá a vše je splněno.", None)
    without_diacritics = _score_task_proof(task, "Pokoj jsem uklidil, podlaha je cista a vse je splneno.", None)
    assert with_diacritics[0] == without_diacritics[0]
    assert with_diacritics[0] >= 45  # dostatečně podložený důkaz není označen k další kontrole
    assert with_diacritics[1] is False


def test_weak_proof_is_flagged():
    task = Task(title="Uklidit pokoj", description=None)
    score, flagged, note = _score_task_proof(task, "ok", None)
    assert flagged is True
    assert "Důvod je slabý" in note

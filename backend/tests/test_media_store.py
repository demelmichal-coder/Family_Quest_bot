import base64
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("DB_URL", f"sqlite:///{Path(tempfile.gettempdir()) / 'test_media_store.db'}")
os.environ.setdefault("TELEGRAM_TOKEN", "test-telegram-token")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-very-long")

import media_store
from media_store import ProofMediaError, resolve_proof_media, store_proof_media

PNG_DATA_URL = "data:image/png;base64," + base64.b64encode(b"\x89PNG fake bytes").decode()


def test_without_bucket_data_url_is_kept(monkeypatch):
    monkeypatch.delenv("GCS_BUCKET", raising=False)
    assert store_proof_media(PNG_DATA_URL, 7) == PNG_DATA_URL
    assert resolve_proof_media(PNG_DATA_URL) == PNG_DATA_URL


def test_with_bucket_photo_is_uploaded_and_marked(monkeypatch):
    monkeypatch.setenv("GCS_BUCKET", "fq-test-bucket")
    with patch.object(media_store, "_upload_bytes") as upload:
        stored = store_proof_media(PNG_DATA_URL, 7)
    assert stored.startswith("gcs:proofs/7/")
    assert stored.endswith(".png")
    bucket, object_name, content, mime = upload.call_args.args[0], upload.call_args.args[1], upload.call_args.args[2], upload.call_args.args[3]
    assert bucket == "fq-test-bucket"
    assert object_name == stored[len("gcs:"):]
    assert content == b"\x89PNG fake bytes"
    assert mime == "image/png"


def test_resolve_gcs_marker_signs_url(monkeypatch):
    monkeypatch.setenv("GCS_BUCKET", "fq-test-bucket")
    with patch.object(media_store, "_signed_url_cached", return_value="https://signed.example/x") as signer:
        assert resolve_proof_media("gcs:proofs/1/a.jpg") == "https://signed.example/x"
    assert signer.call_args.args[:2] == ("fq-test-bucket", "proofs/1/a.jpg")


def test_resolve_gcs_marker_without_bucket_returns_none(monkeypatch):
    monkeypatch.delenv("GCS_BUCKET", raising=False)
    assert resolve_proof_media("gcs:proofs/1/a.jpg") is None


def test_rejects_unsupported_mime(monkeypatch):
    monkeypatch.setenv("GCS_BUCKET", "fq-test-bucket")
    bad = "data:text/html;base64," + base64.b64encode(b"<script>").decode()
    try:
        store_proof_media(bad, 1)
    except ProofMediaError:
        return
    raise AssertionError("expected ProofMediaError")


def test_rejects_oversized_photo(monkeypatch):
    monkeypatch.setenv("GCS_BUCKET", "fq-test-bucket")
    big = "data:image/jpeg;base64," + base64.b64encode(b"x" * (media_store.MAX_BYTES + 1)).decode()
    try:
        store_proof_media(big, 1)
    except ProofMediaError:
        return
    raise AssertionError("expected ProofMediaError")

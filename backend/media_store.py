# media_store.py - ukladani fotek dukazu do Google Cloud Storage.
#
# Zapina se promennou prostredi GCS_BUCKET. Bez ni se fotky dal ukladaji jako
# data URL v databazi (puvodni chovani), takze lokalni vyvoj i testy funguji
# bez cloudu.
#
# V databazi se ulozi marker "gcs:<objekt>". Pri cteni (TaskRead) se prevede na
# podepsanou URL platnou SIGNED_URL_TTL, bucket proto muze byt soukromy.

import base64
import binascii
import logging
import os
import time
import uuid
from datetime import timedelta
from functools import lru_cache

logger = logging.getLogger(__name__)

GCS_PREFIX = "gcs:"
ALLOWED_MIME = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_BYTES = 3 * 1024 * 1024
SIGNED_URL_TTL = timedelta(hours=1)


class ProofMediaError(ValueError):
    """Neplatna fotka (spatny format, prilis velka)."""


def gcs_bucket_name() -> str | None:
    return (os.getenv("GCS_BUCKET") or "").strip() or None


def is_gcs_enabled() -> bool:
    return gcs_bucket_name() is not None


def _parse_data_url(data_url: str) -> tuple[str, bytes]:
    if not data_url.startswith("data:") or ";base64," not in data_url:
        raise ProofMediaError("Fotka musi byt ve formatu data URL (base64).")
    header, encoded = data_url.split(";base64,", 1)
    mime = header[len("data:"):]
    if mime not in ALLOWED_MIME:
        raise ProofMediaError("Nepodporovany format fotky.")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ProofMediaError("Fotka neni platne base64.") from exc
    if len(raw) > MAX_BYTES:
        raise ProofMediaError("Fotka je prilis velka (max 3 MB).")
    return mime, raw


def _upload_bytes(bucket: str, object_name: str, content: bytes, content_type: str) -> None:
    from google.cloud import storage  # lazy: cloud zavislost je potreba jen v produkci

    client = storage.Client()
    client.bucket(bucket).blob(object_name).upload_from_string(content, content_type=content_type)


def store_proof_media(data_url: str | None, task_id: int) -> str | None:
    """Ulozi fotku a vrati hodnotu pro sloupec proof_media_url.

    Bez GCS_BUCKET vraci data_url beze zmeny. Neplatnou fotku odmitne ProofMediaError.
    """
    if not data_url:
        return None
    if not data_url.startswith("data:"):
        # Uz ulozena externi URL nebo marker - nic neprevadime.
        return data_url

    mime, raw = _parse_data_url(data_url)
    bucket = gcs_bucket_name()
    if not bucket:
        return data_url

    object_name = f"proofs/{task_id}/{uuid.uuid4().hex}.{ALLOWED_MIME[mime]}"
    _upload_bytes(bucket, object_name, raw, mime)
    return f"{GCS_PREFIX}{object_name}"


@lru_cache(maxsize=512)
def _signed_url_cached(bucket: str, object_name: str, bucket_minute: int) -> str:
    from google.auth import default as google_auth_default
    from google.auth.transport.requests import Request
    from google.cloud import storage

    credentials, _ = google_auth_default()
    credentials.refresh(Request())
    client = storage.Client(credentials=credentials)
    blob = client.bucket(bucket).blob(object_name)
    return blob.generate_signed_url(
        version="v4",
        expiration=SIGNED_URL_TTL,
        method="GET",
        service_account_email=getattr(credentials, "service_account_email", None),
        access_token=credentials.token,
    )


def resolve_proof_media(stored: str | None) -> str | None:
    """Prevede ulozenou hodnotu na URL pro zobrazeni (data URL a externi URL zustavaji)."""
    if not stored or not stored.startswith(GCS_PREFIX):
        return stored
    bucket = gcs_bucket_name()
    if not bucket:
        logger.warning("Fotka v GCS, ale GCS_BUCKET neni nastaven.")
        return None
    object_name = stored[len(GCS_PREFIX):]
    # Podpis se cachuje na 30 minut, aby se pri nacitani seznamu neposilalo dotazu na kazdy zaznam.
    bucket_minute = int(time.time() // 1800)
    try:
        return _signed_url_cached(bucket, object_name, bucket_minute)
    except Exception:
        logger.exception("Nepodarilo se podepsat URL fotky %s", object_name)
        return None

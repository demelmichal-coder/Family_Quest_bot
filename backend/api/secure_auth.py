import base64
import hashlib
import hmac
import json
import logging
import secrets
import string
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api import _get_or_create_user, get_db
from config import settings
from constants import ROLE_CHILD, ROLE_PARENT
from models import Family, User
from pin_auth import hash_pin, validate_pin_format, verify_pin

PIN_MAX_FAILED_ATTEMPTS = 5
PIN_LOCKOUT_MINUTES = 15
GENERIC_PIN_LOGIN_ERROR = "Neplatné přihlašovací údaje."
FAMILY_CREATE_LIMIT = 5
FAMILY_CREATE_WINDOW_SECONDS = 3600
_family_create_attempts: dict[str, list[float]] = {}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_family_create_limit(request: Request) -> None:
    """Jednoducha ochrana proti hromadnemu zakladani rodin z jedne adresy."""
    ip = _client_ip(request)
    now = time.time()
    recent = [t for t in _family_create_attempts.get(ip, []) if now - t < FAMILY_CREATE_WINDOW_SECONDS]
    if len(recent) >= FAMILY_CREATE_LIMIT:
        _family_create_attempts[ip] = recent
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Příliš mnoho nových rodin z jedné adresy, zkus to později.",
        )
    recent.append(now)
    _family_create_attempts[ip] = recent

logger = logging.getLogger("secure_auth")
router = APIRouter(prefix="/api", tags=["secure-auth"])
bearer_scheme = HTTPBearer(auto_error=False)


class AuthRequest(BaseModel):
    initData: str = Field(min_length=1)


class FamilyCreateRequest(BaseModel):
    family_name: str = Field(min_length=2, max_length=80)
    user_name: str = Field(default="", max_length=80)


class FamilyJoinRequest(BaseModel):
    family_code: str = Field(min_length=4, max_length=32)
    role: str = Field(default="child")
    user_name: str = Field(default="", max_length=80)


class SessionUserRead(BaseModel):
    id: int
    telegram_id: str
    name: str
    role: str
    family_id: int | None


class AuthResponse(BaseModel):
    token: str
    token_type: str = "Bearer"
    expires_in: int
    user: SessionUserRead


class FamilyResponse(BaseModel):
    user: SessionUserRead
    family_id: int
    family_code: str


class FamilyCreateResponse(FamilyResponse):
    family_name: str


class FamilyJoinResponse(FamilyResponse):
    family_name: str


class FamilyMemberOption(BaseModel):
    id: int
    name: str


class PinRegisterRequest(BaseModel):
    family_code: str = Field(min_length=4, max_length=32)
    name: str = Field(min_length=1, max_length=80)
    pin: str = Field(min_length=4, max_length=6)
    role: str = Field(default="child")  # ignorovano: novy clen je vzdy dite


class PinCreateFamilyRequest(BaseModel):
    family_name: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    pin: str = Field(min_length=4, max_length=6)


class PinCreateFamilyResponse(AuthResponse):
    family_id: int
    family_name: str
    family_code: str


class PinLoginRequest(BaseModel):
    family_code: str = Field(min_length=4, max_length=32)
    user_id: int
    pin: str = Field(min_length=4, max_length=6)


class PinSetRequest(BaseModel):
    member_user_id: int
    pin: str = Field(min_length=4, max_length=6)


class PinSetOwnRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=6)


def _base64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def _encode_jwt(payload: dict[str, Any]) -> str:
    if not settings.JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Na backendu chybí JWT_SECRET.",
        )

    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = _base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    signature_b64 = _base64url_encode(signature)
    return f"{header_b64}.{payload_b64}.{signature_b64}"


def _decode_jwt(token: str) -> dict[str, Any]:
    if not settings.JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Na backendu chybí JWT_SECRET.",
        )

    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatný formát tokenu.")

    header_b64, payload_b64, signature_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_signature = hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()

    try:
        received_signature = _base64url_decode(signature_b64)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatný podpis tokenu.") from exc

    if not hmac.compare_digest(expected_signature, received_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatný podpis tokenu.")

    try:
        payload = json.loads(_base64url_decode(payload_b64).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatný obsah tokenu.") from exc

    now = int(time.time())
    exp = int(payload.get("exp", 0))
    if exp <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Platnost přihlášení vypršela.")

    if payload.get("iss") != settings.JWT_ISSUER:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatný vydavatel tokenu.")

    return payload


def _parse_init_data(init_data: str) -> dict[str, str]:
    return dict(parse_qsl(init_data, keep_blank_values=True))


def _validate_telegram_init_data(init_data: str) -> dict[str, Any]:
    data = _parse_init_data(init_data)
    received_hash = data.pop("hash", None)
    user_raw = data.get("user")
    auth_date = data.get("auth_date")

    if not received_hash or not user_raw or not auth_date:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chybí Telegram auth data.")

    if not settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Na backendu chybí TELEGRAM_TOKEN.",
        )

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(data.items()))
    secret_key = hmac.new(
        b"WebAppData",
        settings.TELEGRAM_BOT_TOKEN.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        logger.warning("Odmitnute prihlaseni: neplatny Telegram podpis.")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatný Telegram podpis.")

    try:
        auth_ts = int(auth_date)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatný auth_date.") from exc

    age_seconds = int(time.time()) - auth_ts
    if age_seconds < 0 or age_seconds > settings.TELEGRAM_AUTH_MAX_AGE_SECONDS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Telegram relace je příliš stará.")

    try:
        telegram_user = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatná Telegram user data.") from exc

    return telegram_user


def _map_user(user: User) -> SessionUserRead:
    return SessionUserRead(
        id=user.id,
        telegram_id=user.telegram_id,
        name=user.username or f"Uzivatel {user.telegram_id}",
        role=user.role,
        family_id=user.family_id,
    )


def _create_session_token(user: User) -> tuple[str, int]:
    expires_in_seconds = max(300, settings.JWT_EXPIRES_MINUTES * 60)
    now = int(time.time())
    payload = {
        "iss": settings.JWT_ISSUER,
        "sub": str(user.id),
        "tid": user.telegram_id,
        "role": user.role,
        "family_id": user.family_id,
        "iat": now,
        "exp": now + expires_in_seconds,
    }
    return _encode_jwt(payload), expires_in_seconds


def _generate_family_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


def _ensure_unique_family_code(db: Session) -> str:
    while True:
        candidate = _generate_family_code()
        exists = db.query(Family).filter(Family.invite_code == candidate).first()
        if not exists:
            return candidate


def get_current_session_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chybí autorizační token.")

    payload = _decode_jwt(credentials.credentials)
    telegram_id = str(payload.get("tid") or "").strip()
    if not telegram_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token neobsahuje identitu.")

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Uživatel z tokenu nebyl nalezen.")
    return user


@router.post("/auth", response_model=AuthResponse, summary="Prihlaseni pres Telegram initData")
def auth_with_telegram(payload: AuthRequest, db: Session = Depends(get_db)):
    telegram_user = _validate_telegram_init_data(payload.initData)
    telegram_id = str(telegram_user.get("id") or "").strip()
    if not telegram_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Telegram identita je neplatná.")

    user = _get_or_create_user(db, telegram_id, telegram_user)
    token, expires_in = _create_session_token(user)

    logger.info("Uzivatel %s uspesne prihlasen.", telegram_id)
    return AuthResponse(token=token, expires_in=expires_in, user=_map_user(user))


@router.get("/auth/verify", response_model=SessionUserRead, summary="Overit platnost session tokenu")
def verify_auth(user: User = Depends(get_current_session_user)):
    return _map_user(user)


@router.post("/family/create", response_model=FamilyCreateResponse, summary="Vytvorit novou rodinu")
def create_family(payload: FamilyCreateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_session_user)):
    if user.family_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Už jsi součástí rodiny.")

    family_name = payload.family_name.strip()
    if len(family_name) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Název rodiny je příliš krátký.")

    family = Family(name=family_name, invite_code=_ensure_unique_family_code(db))
    db.add(family)
    db.flush()

    user.family_id = family.id
    user.role = ROLE_PARENT
    if payload.user_name.strip():
        user.username = payload.user_name.strip()

    db.commit()
    db.refresh(user)
    db.refresh(family)

    return FamilyCreateResponse(
        user=_map_user(user),
        family_id=family.id,
        family_name=family.name,
        family_code=family.invite_code,
    )


@router.post("/family/join", response_model=FamilyJoinResponse, summary="Pripojit uzivatele do rodiny pomoci kodu")
def join_family(payload: FamilyJoinRequest, db: Session = Depends(get_db), user: User = Depends(get_current_session_user)):
    if user.family_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Už jsi součástí rodiny.")

    # Kod rodiny sam o sobe nesmi nikomu dat rodicovska prava: novy clen je vzdy dite
    # a rodicem ho muze udelat jen stavajici rodic v administraci.
    role = ROLE_CHILD

    family_code = payload.family_code.strip().upper()
    family = db.query(Family).filter(Family.invite_code == family_code).first()
    if not family:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rodinný kód nebyl nalezen.")

    user.family_id = family.id
    user.role = role
    if payload.user_name.strip():
        user.username = payload.user_name.strip()

    db.commit()
    db.refresh(user)

    return FamilyJoinResponse(
        user=_map_user(user),
        family_id=family.id,
        family_name=family.name,
        family_code=family.invite_code,
    )


def _find_family_by_code(db: Session, family_code: str) -> Family:
    family = db.query(Family).filter(Family.invite_code == family_code.strip().upper()).first()
    if not family:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rodina nenalezena.")
    return family


def _require_pin_pepper() -> str:
    if not settings.PIN_PEPPER:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Na backendu chybí PIN_PEPPER.",
        )
    return settings.PIN_PEPPER


@router.get(
    "/auth/pin/family-members",
    response_model=list[FamilyMemberOption],
    summary="Seznam clenu rodiny s nastavenym PINem (pro PWA vyber profilu)",
)
def list_pin_family_members(family_code: str, db: Session = Depends(get_db)):
    family = _find_family_by_code(db, family_code)
    members = (
        db.query(User)
        .filter(User.family_id == family.id, User.pin_hash.isnot(None))
        .all()
    )
    return [
        FamilyMemberOption(id=member.id, name=member.username or f"Uzivatel {member.id}")
        for member in members
    ]


@router.post(
    "/auth/pin/register",
    response_model=AuthResponse,
    summary="Zalozeni noveho clena rodiny s PINem (PWA, bez Telegramu)",
)
def register_with_pin(payload: PinRegisterRequest, db: Session = Depends(get_db)):
    if not validate_pin_format(payload.pin):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PIN musí mít 4 až 6 číslic.")

    family = _find_family_by_code(db, payload.family_code)

    pepper = _require_pin_pepper()
    user = User(
        telegram_id=f"pwa-{uuid.uuid4()}",
        username=payload.name.strip(),
        role=ROLE_CHILD,
        family_id=family.id,
        auth_kind="pwa",
        pin_hash=hash_pin(payload.pin, pepper),
        pin_set_at=datetime.now(UTC),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token, expires_in = _create_session_token(user)
    logger.info("Novy PWA uzivatel %s zalozen v rodine %s.", user.id, family.id)
    return AuthResponse(token=token, expires_in=expires_in, user=_map_user(user))


@router.post(
    "/auth/pin/create-family",
    response_model=PinCreateFamilyResponse,
    summary="Zalozeni nove rodiny a rodicovskeho uctu s PINem (bez Telegramu)",
)
def create_family_with_pin(payload: PinCreateFamilyRequest, request: Request, db: Session = Depends(get_db)):
    if not validate_pin_format(payload.pin):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PIN musí mít 4 až 6 číslic.")
    family_name = payload.family_name.strip()
    user_name = payload.name.strip()
    if len(family_name) < 2 or not user_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vyplň název rodiny a své jméno.")

    pepper = _require_pin_pepper()
    _check_family_create_limit(request)

    family = Family(name=family_name, invite_code=_ensure_unique_family_code(db))
    db.add(family)
    db.flush()

    user = User(
        telegram_id=f"pwa-{uuid.uuid4()}",
        username=user_name,
        role=ROLE_PARENT,
        family_id=family.id,
        auth_kind="pwa",
        pin_hash=hash_pin(payload.pin, pepper),
        pin_set_at=datetime.now(UTC),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.refresh(family)

    token, expires_in = _create_session_token(user)
    logger.info("Nova rodina %s zalozena pres PWA.", family.id)
    return PinCreateFamilyResponse(
        token=token,
        expires_in=expires_in,
        user=_map_user(user),
        family_id=family.id,
        family_name=family.name,
        family_code=family.invite_code,
    )


@router.post(
    "/auth/pin/login",
    response_model=AuthResponse,
    summary="Prihlaseni jmenem a PINem (PWA)",
)
def login_with_pin(payload: PinLoginRequest, db: Session = Depends(get_db)):
    pepper = _require_pin_pepper()
    family = _find_family_by_code(db, payload.family_code)

    user = (
        db.query(User)
        .filter(User.id == payload.user_id, User.family_id == family.id)
        .first()
    )
    if not user or not user.pin_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_PIN_LOGIN_ERROR)

    now = datetime.now(UTC)
    locked_until = user.pin_locked_until
    if locked_until and locked_until.tzinfo is None:
        # SQLite vraci cas bez zony; ukladame vzdy UTC.
        locked_until = locked_until.replace(tzinfo=UTC)
    if locked_until and locked_until > now:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Účet je dočasně zamčený, zkus to později.",
        )

    if not verify_pin(payload.pin, pepper, user.pin_hash):
        user.pin_failed_attempts = (user.pin_failed_attempts or 0) + 1
        if user.pin_failed_attempts >= PIN_MAX_FAILED_ATTEMPTS:
            user.pin_locked_until = now + timedelta(minutes=PIN_LOCKOUT_MINUTES)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_PIN_LOGIN_ERROR)

    user.pin_failed_attempts = 0
    user.pin_locked_until = None
    db.commit()
    db.refresh(user)

    token, expires_in = _create_session_token(user)
    return AuthResponse(token=token, expires_in=expires_in, user=_map_user(user))


@router.post(
    "/auth/pin/set",
    response_model=SessionUserRead,
    summary="Rodic nastavi/resetuje PIN jinemu clenu rodiny",
)
def set_member_pin(
    payload: PinSetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_session_user),
):
    if current_user.role != ROLE_PARENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pouze rodič může nastavit PIN.")
    if not validate_pin_format(payload.pin):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PIN musí mít 4 až 6 číslic.")

    member = (
        db.query(User)
        .filter(User.id == payload.member_user_id, User.family_id == current_user.family_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Člen rodiny nenalezen.")

    pepper = _require_pin_pepper()
    member.pin_hash = hash_pin(payload.pin, pepper)
    member.pin_set_at = datetime.now(UTC)
    member.pin_failed_attempts = 0
    member.pin_locked_until = None
    member.auth_kind = "both" if member.auth_kind == "telegram" else member.auth_kind
    db.commit()
    db.refresh(member)
    return _map_user(member)


@router.post(
    "/auth/pin/set-own",
    response_model=SessionUserRead,
    summary="Uzivatel si sam nastavi PIN (aby mohl pouzit i PWA)",
)
def set_own_pin(
    payload: PinSetOwnRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_session_user),
):
    if not validate_pin_format(payload.pin):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PIN musí mít 4 až 6 číslic.")

    pepper = _require_pin_pepper()
    current_user.pin_hash = hash_pin(payload.pin, pepper)
    current_user.pin_set_at = datetime.now(UTC)
    current_user.pin_failed_attempts = 0
    current_user.pin_locked_until = None
    if current_user.auth_kind == "telegram":
        current_user.auth_kind = "both"
    db.commit()
    db.refresh(current_user)
    return _map_user(current_user)

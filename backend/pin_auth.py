# pin_auth.py - hashovani a overovani PINu pro PWA prihlaseni

import re

import bcrypt

PIN_PATTERN = re.compile(r"^\d{4,6}$")


def validate_pin_format(pin: str) -> bool:
    return bool(PIN_PATTERN.match(pin or ""))


def hash_pin(pin: str, pepper: str) -> str:
    return bcrypt.hashpw((pin + pepper).encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_pin(pin: str, pepper: str, pin_hash: str) -> bool:
    try:
        return bcrypt.checkpw((pin + pepper).encode("utf-8"), pin_hash.encode("utf-8"))
    except ValueError:
        return False

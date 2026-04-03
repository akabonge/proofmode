import json
from cryptography.fernet import Fernet

from .config import settings

fernet = Fernet(settings.fernet_key.encode() if isinstance(settings.fernet_key, str) else settings.fernet_key)

def encrypt_text(value: str | None) -> str | None:
    if value is None:
        return None
    return fernet.encrypt(value.encode("utf-8")).decode("utf-8")

def decrypt_text(value: str | None) -> str | None:
    if value is None:
        return None
    return fernet.decrypt(value.encode("utf-8")).decode("utf-8")

def encrypt_json(value: dict) -> str:
    raw = json.dumps(value, sort_keys=True)
    return encrypt_text(raw) or ""

def decrypt_json(value: str | None) -> dict:
    if not value:
        return {}
    raw = decrypt_text(value)
    return json.loads(raw) if raw else {}

from datetime import datetime, timedelta, timezone
import secrets
import jwt
from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)

def create_session_token(user_id: str, email: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.token_ttl_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.app_secret, algorithm="HS256")

def decode_session_token(token: str) -> dict:
    return jwt.decode(token, settings.app_secret, algorithms=["HS256"])

def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)

def new_share_token() -> str:
    return secrets.token_hex(32)

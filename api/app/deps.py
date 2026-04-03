from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session
import jwt

from .config import settings
from .db import get_db
from .models import User
from .security import decode_session_token

def get_current_user(
    session_token: str | None = Cookie(default=None, alias=settings.session_cookie_name),
    db: Session = Depends(get_db),
) -> User:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_session_token(session_token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    user = db.get(User, payload["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

def require_csrf(
    request: Request,
    csrf_cookie: str | None = Cookie(default=None, alias=settings.csrf_cookie_name),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        if not csrf_cookie or not x_csrf_token or csrf_cookie != x_csrf_token:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed")

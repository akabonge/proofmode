from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import User
from ..schemas import UserCreate, UserLogin, UserOut
from ..security import hash_password, verify_password, create_session_token, new_csrf_token
from ..deps import get_current_user, require_csrf

router = APIRouter(prefix="/v1/auth", tags=["auth"])


def _set_auth_cookies(response: Response, token: str, csrf_token: str):
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        max_age=settings.token_ttl_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=csrf_token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        max_age=settings.token_ttl_minutes * 60,
        path="/",
    )


@router.post("/register", response_model=UserOut, dependencies=[Depends(require_csrf)])
def register(payload: UserCreate, response: Response, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role="student",
        consent_version=payload.consent_version,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_session_token(user.id, user.email, user.role)
    csrf_token = new_csrf_token()
    _set_auth_cookies(response, token, csrf_token)
    return user


@router.post("/login", response_model=UserOut, dependencies=[Depends(require_csrf)])
def login(payload: UserLogin, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_session_token(user.id, user.email, user.role)
    csrf_token = new_csrf_token()
    _set_auth_cookies(response, token, csrf_token)
    return user


@router.post("/logout", dependencies=[Depends(require_csrf)])
def logout(response: Response):
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        domain=settings.cookie_domain,
    )
    response.delete_cookie(
        key=settings.csrf_cookie_name,
        path="/",
        domain=settings.cookie_domain,
    )
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user=Depends(get_current_user)):
    return user


@router.get("/csrf")
def csrf_seed(response: Response):
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=new_csrf_token(),
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        path="/",
    )
    return {"ok": True}
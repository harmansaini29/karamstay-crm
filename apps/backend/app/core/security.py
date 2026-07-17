from datetime import datetime, timedelta, timezone
from uuid import uuid4

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

password_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_context.verify(password, password_hash)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(*, subject: str, role: str) -> str:
    expires_at = utc_now() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": subject,
        "role": role,
        "type": "access",
        "exp": expires_at,
        "iat": utc_now(),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(*, subject: str) -> tuple[str, str, datetime]:
    jti = uuid4().hex
    expires_at = utc_now() + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": subject,
        "jti": jti,
        "type": "refresh",
        "exp": expires_at,
        "iat": utc_now(),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, jti, expires_at


def decode_token(token: str) -> dict[str, object]:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid token") from exc

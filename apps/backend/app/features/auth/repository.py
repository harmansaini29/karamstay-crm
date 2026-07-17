from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.features.auth.models import OtpCode, RefreshToken, Role, User


class AuthRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_user_by_email(self, email: str) -> User | None:
        statement = (
            select(User)
            .options(selectinload(User.role))
            .where(User.email == email.lower(), User.deleted_at.is_(None))
        )
        return self.db.scalar(statement)

    def get_role_by_name(self, name: str) -> Role:
        role = self.db.scalar(select(Role).where(Role.name == name))
        assert role is not None, f"role {name} is not seeded"
        return role

    def get_user_by_id(self, user_id: int) -> User | None:
        statement = (
            select(User)
            .options(selectinload(User.role))
            .where(User.id == user_id, User.deleted_at.is_(None))
        )
        return self.db.scalar(statement)

    def add_refresh_token(
        self,
        *,
        user_id: int,
        jti: str,
        token_hash: str,
        expires_at: datetime,
        created_at: datetime,
    ) -> RefreshToken:
        refresh_token = RefreshToken(
            user_id=user_id,
            jti=jti,
            token_hash=token_hash,
            expires_at=expires_at,
            created_at=created_at,
        )
        self.db.add(refresh_token)
        return refresh_token

    def get_refresh_token_by_jti(self, jti: str) -> RefreshToken | None:
        statement = (
            select(RefreshToken)
            .options(selectinload(RefreshToken.user).selectinload(User.role))
            .where(RefreshToken.jti == jti)
        )
        return self.db.scalar(statement)

    def revoke_refresh_token(self, refresh_token: RefreshToken, revoked_at: datetime) -> None:
        refresh_token.revoked_at = revoked_at

    def record_login(self, user: User, logged_in_at: datetime) -> None:
        user.last_login_at = logged_in_at

    def add_otp_code(
        self,
        *,
        phone: str,
        code_hash: str,
        expires_at: datetime,
        created_at: datetime,
    ) -> OtpCode:
        otp = OtpCode(phone=phone, code_hash=code_hash, expires_at=expires_at, created_at=created_at)
        self.db.add(otp)
        return otp

    def get_latest_active_otp(self, phone: str, now: datetime) -> OtpCode | None:
        statement = (
            select(OtpCode)
            .where(
                OtpCode.phone == phone,
                OtpCode.consumed_at.is_(None),
                OtpCode.expires_at > now,
            )
            .order_by(OtpCode.created_at.desc())
        )
        return self.db.scalars(statement).first()

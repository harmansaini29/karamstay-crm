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

    def get_user_by_phone(self, phone: str, include_deleted: bool = False) -> User | None:
        clean_phone = phone.strip()
        statement = (
            select(User)
            .options(selectinload(User.role))
            .where(User.phone == clean_phone)
        )
        if not include_deleted:
            statement = statement.where(User.deleted_at.is_(None))
        user = self.db.scalar(statement)
        if user is not None:
            return user

        digits = "".join(c for c in clean_phone if c.isdigit())
        if len(digits) >= 10:
            last10 = digits[-10:]
            candidates = [last10, f"+91{last10}", f"91{last10}", f"0{last10}"]
            cand_stmt = (
                select(User)
                .options(selectinload(User.role))
                .where(User.phone.in_(candidates))
            )
            if not include_deleted:
                cand_stmt = cand_stmt.where(User.deleted_at.is_(None))
            cand_user = self.db.scalar(cand_stmt)
            if cand_user is not None:
                return cand_user

            all_users_stmt = select(User).options(selectinload(User.role))
            if not include_deleted:
                all_users_stmt = all_users_stmt.where(User.deleted_at.is_(None))
            all_users = self.db.scalars(all_users_stmt).all()
            for u in all_users:
                if u.phone:
                    u_digits = "".join(c for c in u.phone if c.isdigit())
                    if u_digits and u_digits[-10:] == last10:
                        return u
        return None

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

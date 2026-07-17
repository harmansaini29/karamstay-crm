import logging
import secrets
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.audit import AuditLogService
from app.core.config import settings
from app.core.notify.whatsapp import send_template_message
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    utc_now,
    verify_password,
)
from app.features.auth.models import RefreshToken, User
from app.features.auth.repository import AuthRepository
from app.features.auth.schemas import LoginRequest, TokenPairResponse
from app.features.settings.keys import KEY_WHATSAPP_OTP_TEMPLATE, get_whatsapp_template
from app.features.tenants.repository import TenantRepository

logger = logging.getLogger("karamstay.auth.otp")

MAX_OTP_ATTEMPTS = 5


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = AuthRepository(db)
        self.tenant_repository = TenantRepository(db)
        self.audit = AuditLogService(db)

    def login(self, payload: LoginRequest) -> TokenPairResponse:
        user = self.repository.get_user_by_email(payload.email)
        if user is None or not user.password_hash or not verify_password(
            payload.password,
            user.password_hash,
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")

        now = utc_now()
        self.repository.record_login(user, now)
        response = self._issue_token_pair(user)
        self.audit.record(
            user_id=user.id,
            action="login",
            entity_type="user",
            entity_id=user.id,
        )
        self.db.commit()
        return response

    def refresh(self, refresh_token: str) -> TokenPairResponse:
        persisted_token = self._get_valid_refresh_token(refresh_token)
        user = persisted_token.user

        now = utc_now()
        self.repository.revoke_refresh_token(persisted_token, now)
        response = self._issue_token_pair(user)
        self.db.commit()
        return response

    def logout(self, refresh_token: str) -> None:
        try:
            persisted_token = self._get_valid_refresh_token(refresh_token)
        except HTTPException:
            return

        self.repository.revoke_refresh_token(persisted_token, utc_now())
        self.db.commit()

    def request_otp(self, phone: str) -> None:
        tenant = self.tenant_repository.get_tenant_by_phone(phone)
        if tenant is None:
            logger.info("OTP requested for unregistered phone %s", phone)
            return

        code = f"{secrets.randbelow(10**settings.otp_length):0{settings.otp_length}d}"
        now = utc_now()
        self.repository.add_otp_code(
            phone=phone,
            code_hash=hash_password(code),
            expires_at=now + timedelta(minutes=settings.otp_expire_minutes),
            created_at=now,
        )
        self.db.commit()

        send_template_message(
            to=phone,
            template_name=get_whatsapp_template(self.db, KEY_WHATSAPP_OTP_TEMPLATE),
            components=[
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": code}],
                },
            ],
        )

    def verify_otp(self, phone: str, code: str) -> TokenPairResponse:
        now = utc_now()
        otp = self.repository.get_latest_active_otp(phone, now)
        if otp is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired OTP")

        if otp.attempts >= MAX_OTP_ATTEMPTS:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many OTP attempts")

        if not verify_password(code, otp.code_hash):
            otp.attempts += 1
            self.db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired OTP")

        otp.consumed_at = now

        tenant = self.tenant_repository.get_tenant_by_phone(phone)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

        if tenant.user_id is not None:
            user = self.repository.get_user_by_id(tenant.user_id)
            if user is None or not user.is_active:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")
        else:
            role = self.repository.get_role_by_name("tenant")
            user = User(role_id=role.id, name=tenant.name, phone=tenant.phone, is_active=True)
            self.db.add(user)
            self.db.flush()
            tenant.user_id = user.id

        self.repository.record_login(user, now)
        response = self._issue_token_pair(user)
        self.audit.record(
            user_id=user.id,
            action="tenant.otp_login",
            entity_type="user",
            entity_id=user.id,
        )
        self.db.commit()
        return response

    def _issue_token_pair(self, user: User) -> TokenPairResponse:
        access_token = create_access_token(subject=str(user.id), role=user.role.name)
        refresh_token, jti, expires_at = create_refresh_token(subject=str(user.id))
        now = utc_now()
        self.repository.add_refresh_token(
            user_id=user.id,
            jti=jti,
            token_hash=hash_password(refresh_token),
            expires_at=expires_at,
            created_at=now,
        )
        return TokenPairResponse(access_token=access_token, refresh_token=refresh_token)

    def _get_valid_refresh_token(self, refresh_token: str) -> RefreshToken:
        try:
            payload = decode_token(refresh_token)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            ) from exc

        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

        jti = payload.get("jti")
        if not isinstance(jti, str):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

        persisted_token = self.repository.get_refresh_token_by_jti(jti)
        if persisted_token is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

        if persisted_token.revoked_at is not None or persisted_token.expires_at <= utc_now():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token is expired or revoked",
            )

        if not verify_password(refresh_token, persisted_token.token_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

        if not persisted_token.user.is_active or persisted_token.user.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")

        return persisted_token

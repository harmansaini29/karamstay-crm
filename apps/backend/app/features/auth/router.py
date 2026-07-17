from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.db.session import get_db
from app.features.auth.dependencies import get_current_user
from app.features.auth.models import User
from app.features.auth.schemas import (
    LoginRequest,
    OtpRequestRequest,
    OtpRequestResponse,
    OtpVerifyRequest,
    RefreshTokenRequest,
    TokenPairResponse,
    UserResponse,
)
from app.features.auth.service import AuthService

router = APIRouter()


@router.post("/login", response_model=TokenPairResponse)
@limiter.limit("10/minute")
def login(
    request: Request,
    payload: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
) -> TokenPairResponse:
    return AuthService(db).login(payload)


@router.post("/refresh", response_model=TokenPairResponse)
def refresh(
    payload: RefreshTokenRequest,
    db: Annotated[Session, Depends(get_db)],
) -> TokenPairResponse:
    return AuthService(db).refresh(payload.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshTokenRequest, db: Annotated[Session, Depends(get_db)]) -> Response:
    AuthService(db).logout(payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserResponse)
def me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user


@router.post("/otp/request", response_model=OtpRequestResponse)
@limiter.limit("5/minute")
def request_otp(
    request: Request,
    payload: OtpRequestRequest,
    db: Annotated[Session, Depends(get_db)],
) -> OtpRequestResponse:
    AuthService(db).request_otp(payload.phone)
    return OtpRequestResponse()


@router.post("/otp/verify", response_model=TokenPairResponse)
@limiter.limit("10/minute")
def verify_otp(
    request: Request,
    payload: OtpVerifyRequest,
    db: Annotated[Session, Depends(get_db)],
) -> TokenPairResponse:
    return AuthService(db).verify_otp(payload.phone, payload.code)

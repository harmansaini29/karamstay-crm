from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.db.session import get_db
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User
from app.features.notifications.schemas import (
    BroadcastNoticeRequest,
    BroadcastNoticeResponse,
    DeviceRegisterRequest,
    NotificationResponse,
)
from app.features.notifications.service import NotificationService

router = APIRouter()
AnyUser = Annotated[User, Depends(require_roles(["owner", "manager", "accountant", "tenant"]))]
OwnerUser = Annotated[User, Depends(require_roles(["owner"]))]
DbSession = Annotated[Session, Depends(get_db)]


@router.post("/devices", status_code=status.HTTP_204_NO_CONTENT)
def register_device(payload: DeviceRegisterRequest, current_user: AnyUser, db: DbSession) -> None:
    NotificationService(db).register_device(payload, current_user)


@router.get("/notifications", response_model=list[NotificationResponse])
def list_notifications(current_user: AnyUser, db: DbSession) -> list[NotificationResponse]:
    return NotificationService(db).list_notifications(current_user)


@router.patch("/notifications/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    current_user: AnyUser,
    db: DbSession,
) -> NotificationResponse:
    return NotificationService(db).mark_read(notification_id, current_user)


@router.post("/notices", response_model=BroadcastNoticeResponse)
@limiter.limit("30/minute")
def broadcast_notice(
    request: Request,
    payload: BroadcastNoticeRequest,
    current_user: OwnerUser,
    db: DbSession,
) -> BroadcastNoticeResponse:
    count = NotificationService(db).broadcast_notice(payload, current_user)
    return BroadcastNoticeResponse(recipients_notified=count)

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.audit import AuditLogService
from app.core.security import utc_now
from app.features.auth.models import User
from app.features.notifications.dispatcher import notify_push_all_devices, notify_whatsapp
from app.features.notifications.models import DeviceToken, Notification
from app.features.notifications.repository import NotificationRepository
from app.features.notifications.schemas import BroadcastNoticeRequest, DeviceRegisterRequest
from app.features.settings.keys import KEY_WHATSAPP_GENERIC_NOTICE_TEMPLATE, get_whatsapp_template


class NotificationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = NotificationRepository(db)
        self.audit = AuditLogService(db)

    def register_device(self, payload: DeviceRegisterRequest, current_user: User) -> DeviceToken:
        device = self.repository.upsert_device_token(
            user_id=current_user.id,
            fcm_token=payload.fcm_token,
            platform=payload.platform,
        )
        self.db.commit()
        self.db.refresh(device)
        return device

    def list_notifications(self, current_user: User) -> list[Notification]:
        return self.repository.list_for_user(current_user.id)

    def mark_read(self, notification_id: int, current_user: User) -> Notification:
        notification = self.repository.get_notification(notification_id)
        if notification is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
        if notification.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Notification access denied")
        if notification.read_at is None:
            notification.read_at = utc_now()
            self.db.commit()
            self.db.refresh(notification)
        return notification

    def broadcast_notice(self, payload: BroadcastNoticeRequest, current_user: User) -> int:
        if payload.property_id is not None and not self.repository.property_exists(payload.property_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

        recipients = self.repository.list_broadcast_recipients(payload.property_id)
        template_name = get_whatsapp_template(self.db, KEY_WHATSAPP_GENERIC_NOTICE_TEMPLATE)
        for tenant in recipients:
            notify_whatsapp(
                self.db,
                user_id=tenant.user_id,
                phone=tenant.phone,
                notification_type="broadcast_notice",
                title=payload.title,
                message=payload.message,
                template_name=template_name,
            )
            if tenant.user_id is not None:
                notify_push_all_devices(
                    self.db,
                    user_id=tenant.user_id,
                    notification_type="broadcast_notice",
                    title=payload.title,
                    message=payload.message,
                )

        self.audit.record(
            user_id=current_user.id,
            action="notice.broadcast",
            entity_type="property",
            entity_id=payload.property_id,
            metadata={"title": payload.title, "recipients": len(recipients)},
        )
        self.db.commit()
        return len(recipients)

from sqlalchemy.orm import Session

from app.core.notify.dispatch import send_with_retry
from app.core.notify.fcm import send_push
from app.core.notify.whatsapp import send_template_message
from app.core.security import utc_now
from app.features.notifications.models import Notification
from app.features.notifications.repository import NotificationRepository

_STATUS_MAP = {"sent": "sent", "skipped": "skipped"}


def notify_whatsapp(
    db: Session,
    *,
    user_id: int | None,
    phone: str,
    notification_type: str,
    title: str,
    message: str,
    template_name: str = "karamstay_generic_notice",
) -> Notification:
    repository = NotificationRepository(db)
    notification = Notification(
        user_id=user_id,
        channel="whatsapp",
        notification_type=notification_type,
        title=title,
        message=message,
        status="pending",
    )
    repository.add_notification(notification)
    db.flush()

    result = send_with_retry(
        send_template_message,
        to=phone,
        template_name=template_name,
        components=[{"type": "body", "parameters": [{"type": "text", "text": message}]}],
    )
    notification.status = _STATUS_MAP.get(result.get("status"), "failed")
    if notification.status == "sent":
        notification.sent_at = utc_now()
    db.commit()
    return notification


def notify_push_all_devices(
    db: Session,
    *,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
) -> list[Notification]:
    repository = NotificationRepository(db)
    tokens = repository.list_device_tokens(user_id)
    notifications: list[Notification] = []
    for device in tokens:
        notification = Notification(
            user_id=user_id,
            channel="push",
            notification_type=notification_type,
            title=title,
            message=message,
            status="pending",
        )
        repository.add_notification(notification)
        db.flush()

        result = send_with_retry(send_push, token=device.fcm_token, title=title, body=message)
        notification.status = _STATUS_MAP.get(result.get("status"), "failed")
        if notification.status == "sent":
            notification.sent_at = utc_now()
        notifications.append(notification)
    db.commit()
    return notifications

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.notifications.models import DeviceToken, Notification
from app.features.properties.models import ManagerPropertyAssignment as MPA
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant


class NotificationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add_notification(self, notification: Notification) -> Notification:
        self.db.add(notification)
        return notification

    def get_notification(self, notification_id: int) -> Notification | None:
        statement = select(Notification).where(
            Notification.id == notification_id,
            Notification.deleted_at.is_(None),
        )
        return self.db.scalar(statement)

    def list_for_user(self, user_id: int) -> list[Notification]:
        statement = (
            select(Notification)
            .where(Notification.user_id == user_id, Notification.deleted_at.is_(None))
            .order_by(Notification.created_at.desc())
        )
        return list(self.db.scalars(statement))

    def upsert_device_token(self, *, user_id: int, fcm_token: str, platform: str) -> DeviceToken:
        existing = self.db.scalar(select(DeviceToken).where(DeviceToken.fcm_token == fcm_token))
        if existing is not None:
            existing.user_id = user_id
            existing.platform = platform
            return existing
        device = DeviceToken(user_id=user_id, fcm_token=fcm_token, platform=platform)
        self.db.add(device)
        return device

    def list_device_tokens(self, user_id: int) -> list[DeviceToken]:
        statement = select(DeviceToken).where(DeviceToken.user_id == user_id)
        return list(self.db.scalars(statement))

    def list_broadcast_recipients(self, property_id: int | None) -> list[Tenant]:
        if property_id is None:
            statement = select(Tenant).where(Tenant.deleted_at.is_(None), Tenant.status == "active")
            return list(self.db.scalars(statement))
        statement = (
            select(Tenant)
            .join(Tenancy, Tenancy.tenant_id == Tenant.id)
            .join(Unit, Unit.id == Tenancy.unit_id)
            .where(
                Unit.property_id == property_id,
                Tenancy.status == "active",
                Tenant.deleted_at.is_(None),
            )
            .distinct()
        )
        return list(self.db.scalars(statement))

    def manager_can_access_property(self, manager_id: int, property_id: int) -> bool:
        statement = select(MPA.id).where(MPA.manager_id == manager_id, MPA.property_id == property_id)
        return self.db.scalar(statement) is not None

    def property_exists(self, property_id: int) -> bool:
        statement = select(Property.id).where(Property.id == property_id, Property.deleted_at.is_(None))
        return self.db.scalar(statement) is not None

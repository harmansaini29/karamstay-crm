from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.maintenance.models import MaintenanceTicket
from app.features.properties.models import Unit
from app.features.tenants.models import Tenancy


class AnalyticsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def count_open_tickets(self, property_ids: list[int] | None) -> int:
        statement = (
            select(func.count(MaintenanceTicket.id))
            .join(Unit, Unit.id == MaintenanceTicket.unit_id)
            .where(
                MaintenanceTicket.status.in_(["open", "in_progress"]),
                MaintenanceTicket.deleted_at.is_(None),
            )
        )
        if property_ids is not None:
            statement = statement.where(Unit.property_id.in_(property_ids))
        return self.db.scalar(statement) or 0

    def count_upcoming_move_ins(self, property_ids: list[int] | None, start: date, end: date) -> int:
        statement = (
            select(func.count(Tenancy.id))
            .join(Unit, Unit.id == Tenancy.unit_id)
            .where(
                Tenancy.status == "active",
                Tenancy.start_date >= start,
                Tenancy.start_date <= end,
                Tenancy.deleted_at.is_(None),
            )
        )
        if property_ids is not None:
            statement = statement.where(Unit.property_id.in_(property_ids))
        return self.db.scalar(statement) or 0

    def count_upcoming_move_outs(self, property_ids: list[int] | None, start: date, end: date) -> int:
        statement = (
            select(func.count(Tenancy.id))
            .join(Unit, Unit.id == Tenancy.unit_id)
            .where(
                Tenancy.status == "active",
                Tenancy.end_date.is_not(None),
                Tenancy.end_date >= start,
                Tenancy.end_date <= end,
                Tenancy.deleted_at.is_(None),
            )
        )
        if property_ids is not None:
            statement = statement.where(Unit.property_id.in_(property_ids))
        return self.db.scalar(statement) or 0

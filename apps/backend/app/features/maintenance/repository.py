from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.maintenance.models import MaintenanceTicket
from app.features.properties.models import ManagerPropertyAssignment as MPA
from app.features.properties.models import Property, Unit


class MaintenanceRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add_ticket(self, ticket: MaintenanceTicket) -> MaintenanceTicket:
        self.db.add(ticket)
        return ticket

    def get_ticket(self, ticket_id: int) -> MaintenanceTicket | None:
        statement = select(MaintenanceTicket).where(
            MaintenanceTicket.id == ticket_id,
            MaintenanceTicket.deleted_at.is_(None),
        )
        return self.db.scalar(statement)

    def list_all(self) -> list[MaintenanceTicket]:
        statement = (
            select(MaintenanceTicket)
            .where(MaintenanceTicket.deleted_at.is_(None))
            .order_by(MaintenanceTicket.created_at.desc())
        )
        return list(self.db.scalars(statement))

    def list_for_manager(self, manager_id: int) -> list[MaintenanceTicket]:
        statement = (
            select(MaintenanceTicket)
            .join(Unit, Unit.id == MaintenanceTicket.unit_id)
            .join(Property, Property.id == Unit.property_id)
            .join(MPA, MPA.property_id == Property.id)
            .where(MPA.manager_id == manager_id, MaintenanceTicket.deleted_at.is_(None))
            .order_by(MaintenanceTicket.created_at.desc())
        )
        return list(self.db.scalars(statement))

    def list_for_tenant(self, tenant_id: int) -> list[MaintenanceTicket]:
        statement = (
            select(MaintenanceTicket)
            .where(MaintenanceTicket.tenant_id == tenant_id, MaintenanceTicket.deleted_at.is_(None))
            .order_by(MaintenanceTicket.created_at.desc())
        )
        return list(self.db.scalars(statement))

    def manager_can_access_unit(self, manager_id: int, unit_id: int) -> bool:
        statement = (
            select(Unit.id)
            .join(Property, Property.id == Unit.property_id)
            .join(MPA, MPA.property_id == Property.id)
            .where(MPA.manager_id == manager_id, Unit.id == unit_id)
        )
        return self.db.scalar(statement) is not None

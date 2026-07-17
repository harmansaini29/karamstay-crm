from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.audit import AuditLogService
from app.core.security import utc_now
from app.features.auth.models import User
from app.features.maintenance.models import MaintenanceTicket
from app.features.maintenance.repository import MaintenanceRepository
from app.features.maintenance.schemas import MaintenanceTicketCreate, MaintenanceTicketUpdate
from app.features.notifications.dispatcher import notify_push_all_devices, notify_whatsapp
from app.features.payments.models import Expense
from app.features.payments.repository import PaymentRepository
from app.features.properties.repository import PropertyRepository
from app.features.tenants.models import Tenant
from app.features.tenants.repository import TenantRepository

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "open": {"in_progress", "closed"},
    "in_progress": {"completed", "open"},
    "completed": {"closed", "in_progress"},
    "closed": set(),
}


class MaintenanceService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = MaintenanceRepository(db)
        self.property_repository = PropertyRepository(db)
        self.payment_repository = PaymentRepository(db)
        self.tenant_repository = TenantRepository(db)
        self.audit = AuditLogService(db)

    def create_ticket(self, payload: MaintenanceTicketCreate, current_user: User) -> MaintenanceTicket:
        unit = self.property_repository.get_unit(payload.unit_id)
        if unit is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

        tenant_id: int | None = None
        role = current_user.role.name
        if role == "manager" and not self.property_repository.manager_has_property(
            current_user.id,
            unit.property_id,
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Property access denied")
        if role == "tenant":
            tenant = self.payment_repository.get_tenant_by_user_id(current_user.id)
            if tenant is None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant profile not found")
            active_tenancy = self.tenant_repository.get_active_tenancy_for_unit(unit.id)
            if active_tenancy is None or active_tenancy.tenant_id != tenant.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have an active tenancy on this unit",
                )
            tenant_id = tenant.id

        ticket = MaintenanceTicket(
            tenant_id=tenant_id,
            unit_id=unit.id,
            category=payload.category,
            priority=payload.priority,
            description=payload.description,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.add_ticket(ticket)
        self.db.flush()
        self.audit.record(
            user_id=current_user.id,
            action="maintenance_ticket.create",
            entity_type="maintenance_ticket",
            entity_id=ticket.id,
        )
        self.db.commit()
        self.db.refresh(ticket)
        return ticket

    def list_tickets(self, current_user: User) -> list[MaintenanceTicket]:
        role = current_user.role.name
        if role in ("owner", "accountant"):
            return self.repository.list_all()
        if role == "manager":
            return self.repository.list_for_manager(current_user.id)
        tenant = self.payment_repository.get_tenant_by_user_id(current_user.id)
        if tenant is None:
            return []
        return self.repository.list_for_tenant(tenant.id)

    def _get_ticket_for_user(self, ticket_id: int, current_user: User) -> MaintenanceTicket:
        ticket = self.repository.get_ticket(ticket_id)
        if ticket is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Maintenance ticket not found")
        role = current_user.role.name
        if role == "manager" and not self.repository.manager_can_access_unit(current_user.id, ticket.unit_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ticket access denied")
        if role == "tenant":
            tenant = self.payment_repository.get_tenant_by_user_id(current_user.id)
            if tenant is None or ticket.tenant_id != tenant.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ticket access denied")
        return ticket

    def get_ticket(self, ticket_id: int, current_user: User) -> MaintenanceTicket:
        return self._get_ticket_for_user(ticket_id, current_user)

    def update_ticket(
        self,
        ticket_id: int,
        payload: MaintenanceTicketUpdate,
        current_user: User,
    ) -> MaintenanceTicket:
        ticket = self._get_ticket_for_user(ticket_id, current_user)
        update_data = payload.model_dump(exclude_unset=True)

        new_status = update_data.get("status")
        if new_status is not None and new_status != ticket.status:
            allowed = ALLOWED_TRANSITIONS.get(ticket.status, set())
            if new_status not in allowed:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Cannot transition ticket from '{ticket.status}' to '{new_status}'",
                )

        for field, value in update_data.items():
            setattr(ticket, field, value)
        ticket.updated_by_id = current_user.id

        if new_status == "completed":
            ticket.resolved_at = utc_now()
            if ticket.cost and ticket.cost > 0:
                unit = self.property_repository.get_unit(ticket.unit_id)
                if unit is not None:
                    self.payment_repository.add_expense(
                        Expense(
                            property_id=unit.property_id,
                            category="Maintenance",
                            amount=ticket.cost,
                            expense_date=utc_now().date(),
                            description=f"Maintenance: {ticket.category} (ticket #{ticket.id})",
                            maintenance_ticket_id=ticket.id,
                            created_by_id=current_user.id,
                            updated_by_id=current_user.id,
                        ),
                    )

        self.audit.record(
            user_id=current_user.id,
            action="maintenance_ticket.update",
            entity_type="maintenance_ticket",
            entity_id=ticket.id,
            metadata=update_data,
        )
        self.db.commit()
        self.db.refresh(ticket)

        if new_status is not None and ticket.tenant_id is not None:
            self._notify_status_change(ticket, new_status)

        return ticket

    def _notify_status_change(self, ticket: MaintenanceTicket, new_status: str) -> None:
        tenant = self.db.get(Tenant, ticket.tenant_id)
        if tenant is None:
            return
        message = f"Your maintenance request '{ticket.category}' is now '{new_status.replace('_', ' ')}'."
        notify_whatsapp(
            self.db,
            user_id=tenant.user_id,
            phone=tenant.phone,
            notification_type="maintenance_status",
            title="Maintenance Update",
            message=message,
        )
        if tenant.user_id is not None:
            notify_push_all_devices(
                self.db,
                user_id=tenant.user_id,
                notification_type="maintenance_status",
                title="Maintenance Update",
                message=message,
            )

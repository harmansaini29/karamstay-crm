from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.maintenance.models import MaintenanceTicket
from app.features.payments.models import Expense, Invoice, Payment
from app.features.properties.models import ManagerPropertyAssignment as MPA
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant


class ReportRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def manager_can_access_property(self, manager_id: int, property_id: int) -> bool:
        statement = select(MPA.id).where(MPA.manager_id == manager_id, MPA.property_id == property_id)
        return self.db.scalar(statement) is not None

    def manager_property_ids(self, manager_id: int) -> list[int]:
        statement = select(MPA.property_id).where(MPA.manager_id == manager_id)
        return list(self.db.scalars(statement))

    def property_exists(self, property_id: int) -> bool:
        statement = select(Property.id).where(Property.id == property_id, Property.deleted_at.is_(None))
        return self.db.scalar(statement) is not None

    def occupancy(self, property_ids: list[int] | None) -> tuple[int, int]:
        statement = select(Unit.status, func.count(Unit.id)).where(Unit.deleted_at.is_(None))
        if property_ids is not None:
            statement = statement.where(Unit.property_id.in_(property_ids))
        statement = statement.group_by(Unit.status)
        counts = dict(self.db.execute(statement).all())
        total = sum(counts.values())
        occupied = counts.get("occupied", 0)
        return total, occupied

    def revenue(self, billing_period: str | None, property_ids: list[int] | None) -> tuple[Decimal, Decimal]:
        invoice_stmt = select(func.coalesce(func.sum(Invoice.amount + Invoice.late_fee_amount), 0)).where(
            Invoice.deleted_at.is_(None),
        )
        payment_stmt = select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.status == "captured",
            Payment.deleted_at.is_(None),
        )

        if billing_period is not None or property_ids is not None:
            payment_stmt = payment_stmt.join(Invoice, Invoice.id == Payment.invoice_id)

        if billing_period is not None:
            invoice_stmt = invoice_stmt.where(Invoice.billing_period == billing_period)
            payment_stmt = payment_stmt.where(Invoice.billing_period == billing_period)

        if property_ids is not None:
            invoice_stmt = (
                invoice_stmt.join(Tenancy, Tenancy.id == Invoice.tenancy_id)
                .join(Unit, Unit.id == Tenancy.unit_id)
                .where(Unit.property_id.in_(property_ids))
            )
            payment_stmt = (
                payment_stmt.join(Tenancy, Tenancy.id == Invoice.tenancy_id)
                .join(Unit, Unit.id == Tenancy.unit_id)
                .where(Unit.property_id.in_(property_ids))
            )

        total_invoiced = self.db.scalar(invoice_stmt) or 0
        total_collected = self.db.scalar(payment_stmt) or 0
        return Decimal(str(total_invoiced)), Decimal(str(total_collected))

    def pending_invoices(self, property_ids: list[int] | None) -> list[tuple[Invoice, str, str]]:
        statement = (
            select(Invoice, Tenant.name, Unit.unit_no)
            .join(Tenancy, Tenancy.id == Invoice.tenancy_id)
            .join(Tenant, Tenant.id == Tenancy.tenant_id)
            .join(Unit, Unit.id == Tenancy.unit_id)
            .where(Invoice.status.in_(["pending", "partial", "overdue"]), Invoice.deleted_at.is_(None))
        )
        if property_ids is not None:
            statement = statement.where(Unit.property_id.in_(property_ids))
        return list(self.db.execute(statement).all())

    def defaulters(self, property_ids: list[int] | None) -> list[tuple[Tenant, Decimal, date]]:
        statement = (
            select(Tenant, func.sum(Invoice.amount + Invoice.late_fee_amount), func.min(Invoice.due_date))
            .join(Tenancy, Tenancy.id == Invoice.tenancy_id)
            .join(Tenant, Tenant.id == Tenancy.tenant_id)
            .join(Unit, Unit.id == Tenancy.unit_id)
            .where(Invoice.status == "overdue", Invoice.deleted_at.is_(None))
            .group_by(Tenant.id)
        )
        if property_ids is not None:
            statement = statement.where(Unit.property_id.in_(property_ids))
        return list(self.db.execute(statement).all())

    def expenses_by_category(
        self,
        property_ids: list[int] | None,
        start_date: date | None,
        end_date: date | None,
    ) -> list[tuple[str, Decimal]]:
        statement = select(Expense.category, func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.deleted_at.is_(None),
        )
        if property_ids is not None:
            statement = statement.where(Expense.property_id.in_(property_ids))
        if start_date is not None:
            statement = statement.where(Expense.expense_date >= start_date)
        if end_date is not None:
            statement = statement.where(Expense.expense_date <= end_date)
        statement = statement.group_by(Expense.category)
        return list(self.db.execute(statement).all())

    def maintenance_cost(
        self,
        property_ids: list[int] | None,
        start_date: date | None,
        end_date: date | None,
    ) -> tuple[Decimal, int]:
        statement = (
            select(func.coalesce(func.sum(MaintenanceTicket.cost), 0), func.count(MaintenanceTicket.id))
            .join(Unit, Unit.id == MaintenanceTicket.unit_id)
            .where(MaintenanceTicket.deleted_at.is_(None))
        )
        if property_ids is not None:
            statement = statement.where(Unit.property_id.in_(property_ids))
        if start_date is not None:
            statement = statement.where(MaintenanceTicket.created_at >= start_date)
        if end_date is not None:
            statement = statement.where(MaintenanceTicket.created_at <= end_date)
        total_cost, count = self.db.execute(statement).one()
        return Decimal(str(total_cost)), count

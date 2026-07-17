from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import utc_now
from app.features.auth.models import User
from app.features.reports.repository import ReportRepository
from app.features.reports.schemas import (
    CollectionRateReport,
    DefaulterItem,
    ExpenseCategoryTotal,
    MaintenanceCostReport,
    OccupancyReport,
    PendingDueItem,
    RevenueReport,
)


class ReportService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = ReportRepository(db)

    def resolve_property_scope(self, current_user: User, property_id: int | None) -> list[int] | None:
        role = current_user.role.name
        if property_id is not None:
            if not self.repository.property_exists(property_id):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
            if role == "manager" and not self.repository.manager_can_access_property(
                current_user.id,
                property_id,
            ):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Property access denied")
            return [property_id]
        if role == "manager":
            return self.repository.manager_property_ids(current_user.id)
        return None

    def occupancy(self, current_user: User, property_id: int | None) -> OccupancyReport:
        property_ids = self.resolve_property_scope(current_user, property_id)
        total, occupied = self.repository.occupancy(property_ids)
        rate = round((occupied / total) * 100, 2) if total else 0.0
        return OccupancyReport(
            property_id=property_id,
            total_units=total,
            occupied_units=occupied,
            vacant_units=total - occupied,
            occupancy_rate=rate,
        )

    def revenue(self, current_user: User, billing_period: str | None, property_id: int | None) -> RevenueReport:
        property_ids = self.resolve_property_scope(current_user, property_id)
        total_invoiced, total_collected = self.repository.revenue(billing_period, property_ids)
        return RevenueReport(
            billing_period=billing_period,
            total_invoiced=total_invoiced,
            total_collected=total_collected,
        )

    def collection_rate(
        self,
        current_user: User,
        billing_period: str | None,
        property_id: int | None,
    ) -> CollectionRateReport:
        property_ids = self.resolve_property_scope(current_user, property_id)
        total_invoiced, total_collected = self.repository.revenue(billing_period, property_ids)
        rate = round(float(total_collected / total_invoiced) * 100, 2) if total_invoiced else 0.0
        return CollectionRateReport(
            billing_period=billing_period,
            total_invoiced=total_invoiced,
            total_collected=total_collected,
            collection_rate=rate,
        )

    def pending_dues(self, current_user: User, property_id: int | None) -> list[PendingDueItem]:
        property_ids = self.resolve_property_scope(current_user, property_id)
        today = utc_now().date()
        items = []
        for invoice, tenant_name, unit_no in self.repository.pending_invoices(property_ids):
            paid = sum((p.amount for p in invoice.payments if p.status == "captured"), Decimal("0.00"))
            amount_due = max(invoice.amount + invoice.late_fee_amount - paid, Decimal("0.00"))
            if amount_due <= 0:
                continue
            items.append(
                PendingDueItem(
                    invoice_id=invoice.id,
                    tenancy_id=invoice.tenancy_id,
                    tenant_name=tenant_name,
                    unit_label=unit_no,
                    amount_due=amount_due,
                    due_date=invoice.due_date,
                    days_overdue=max((today - invoice.due_date).days, 0),
                ),
            )
        return items

    def expenses(
        self,
        current_user: User,
        property_id: int | None,
        start_date: date | None,
        end_date: date | None,
    ) -> list[ExpenseCategoryTotal]:
        property_ids = self.resolve_property_scope(current_user, property_id)
        rows = self.repository.expenses_by_category(property_ids, start_date, end_date)
        return [ExpenseCategoryTotal(category=category, total_amount=Decimal(str(total))) for category, total in rows]

    def defaulters(self, current_user: User, property_id: int | None) -> list[DefaulterItem]:
        property_ids = self.resolve_property_scope(current_user, property_id)
        rows = self.repository.defaulters(property_ids)
        return [
            DefaulterItem(
                tenant_id=tenant.id,
                tenant_name=tenant.name,
                phone=tenant.phone,
                total_overdue=Decimal(str(total_overdue)),
                oldest_due_date=oldest_due_date,
            )
            for tenant, total_overdue, oldest_due_date in rows
        ]

    def maintenance_cost(
        self,
        current_user: User,
        property_id: int | None,
        start_date: date | None,
        end_date: date | None,
    ) -> MaintenanceCostReport:
        property_ids = self.resolve_property_scope(current_user, property_id)
        total_cost, count = self.repository.maintenance_cost(property_ids, start_date, end_date)
        return MaintenanceCostReport(property_id=property_id, total_cost=total_cost, ticket_count=count)

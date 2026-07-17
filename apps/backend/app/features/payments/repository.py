from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.payments.models import Expense, Invoice, LedgerEntry, Payment
from app.features.properties.models import ManagerPropertyAssignment as MPA
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant


class PaymentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _manager_tenancy_filter(self, statement, manager_id: int):
        return (
            statement.join(Tenancy, Tenancy.id == Invoice.tenancy_id)
            .join(Unit, Unit.id == Tenancy.unit_id)
            .join(Property, Property.id == Unit.property_id)
            .join(MPA, MPA.property_id == Property.id)
            .where(MPA.manager_id == manager_id)
        )

    def get_invoice(self, invoice_id: int) -> Invoice | None:
        statement = select(Invoice).where(Invoice.id == invoice_id, Invoice.deleted_at.is_(None))
        return self.db.scalar(statement)

    def get_invoice_for_period(self, tenancy_id: int, billing_period: str) -> Invoice | None:
        statement = select(Invoice).where(
            Invoice.tenancy_id == tenancy_id,
            Invoice.billing_period == billing_period,
        )
        return self.db.scalar(statement)

    def add_invoice(self, invoice: Invoice) -> Invoice:
        self.db.add(invoice)
        return invoice

    def list_invoices_for_owner(self) -> list[Invoice]:
        statement = select(Invoice).where(Invoice.deleted_at.is_(None)).order_by(Invoice.due_date.desc())
        return list(self.db.scalars(statement))

    def list_invoices_for_manager(self, manager_id: int) -> list[Invoice]:
        statement = select(Invoice).where(Invoice.deleted_at.is_(None))
        statement = self._manager_tenancy_filter(statement, manager_id).order_by(Invoice.due_date.desc())
        return list(self.db.scalars(statement))

    def list_invoices_for_tenant(self, tenant_id: int) -> list[Invoice]:
        statement = (
            select(Invoice)
            .join(Tenancy, Tenancy.id == Invoice.tenancy_id)
            .where(Tenancy.tenant_id == tenant_id, Invoice.deleted_at.is_(None))
            .order_by(Invoice.due_date.desc())
        )
        return list(self.db.scalars(statement))

    def list_overdue_invoices(self, as_of: date) -> list[Invoice]:
        statement = select(Invoice).where(
            Invoice.status.in_(["pending", "partial", "overdue"]),
            Invoice.due_date < as_of,
            Invoice.deleted_at.is_(None),
        )
        return list(self.db.scalars(statement))

    def get_tenancy(self, tenancy_id: int) -> Tenancy | None:
        statement = select(Tenancy).where(Tenancy.id == tenancy_id, Tenancy.deleted_at.is_(None))
        return self.db.scalar(statement)

    def list_active_tenancies(self) -> list[Tenancy]:
        statement = select(Tenancy).where(Tenancy.status == "active", Tenancy.deleted_at.is_(None))
        return list(self.db.scalars(statement))

    def manager_has_tenancy(self, manager_id: int, tenancy_id: int) -> bool:
        statement = (
            select(Tenancy.id)
            .join(Unit, Unit.id == Tenancy.unit_id)
            .join(Property, Property.id == Unit.property_id)
            .join(MPA, MPA.property_id == Property.id)
            .where(MPA.manager_id == manager_id, Tenancy.id == tenancy_id)
        )
        return self.db.scalar(statement) is not None

    def get_tenant_by_user_id(self, user_id: int) -> Tenant | None:
        statement = select(Tenant).where(Tenant.user_id == user_id, Tenant.deleted_at.is_(None))
        return self.db.scalar(statement)

    def get_payment(self, payment_id: int) -> Payment | None:
        statement = select(Payment).where(Payment.id == payment_id, Payment.deleted_at.is_(None))
        return self.db.scalar(statement)

    def add_payment(self, payment: Payment) -> Payment:
        self.db.add(payment)
        return payment

    def list_payments_for_owner(self) -> list[Payment]:
        statement = select(Payment).where(Payment.deleted_at.is_(None)).order_by(Payment.created_at.desc())
        return list(self.db.scalars(statement))

    def list_payments_for_tenant(self, tenant_id: int) -> list[Payment]:
        statement = (
            select(Payment)
            .join(Tenancy, Tenancy.id == Payment.tenancy_id)
            .where(Tenancy.tenant_id == tenant_id, Payment.deleted_at.is_(None))
            .order_by(Payment.created_at.desc())
        )
        return list(self.db.scalars(statement))

    def add_ledger_entry(self, entry: LedgerEntry) -> LedgerEntry:
        self.db.add(entry)
        return entry

    def list_ledger_for_tenancy(self, tenancy_id: int) -> list[LedgerEntry]:
        statement = (
            select(LedgerEntry)
            .where(LedgerEntry.tenancy_id == tenancy_id, LedgerEntry.deleted_at.is_(None))
            .order_by(LedgerEntry.occurred_on)
        )
        return list(self.db.scalars(statement))

    def add_expense(self, expense: Expense) -> Expense:
        self.db.add(expense)
        return expense

    def list_expenses_for_property(self, property_id: int) -> list[Expense]:
        statement = (
            select(Expense)
            .where(Expense.property_id == property_id, Expense.deleted_at.is_(None))
            .order_by(Expense.expense_date.desc())
        )
        return list(self.db.scalars(statement))

    def list_expenses_all(self) -> list[Expense]:
        statement = select(Expense).where(Expense.deleted_at.is_(None)).order_by(Expense.expense_date.desc())
        return list(self.db.scalars(statement))

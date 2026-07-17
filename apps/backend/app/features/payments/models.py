from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditActorMixin, Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.features.tenants.models import Tenancy


class Invoice(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("tenancy_id", "billing_period", name="uq_invoices_tenancy_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tenancy_id: Mapped[int] = mapped_column(ForeignKey("tenancies.id"), index=True, nullable=False)
    billing_period: Mapped[str] = mapped_column(String(7), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    late_fee_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), index=True, nullable=False, default="pending")

    tenancy: Mapped["Tenancy"] = relationship(back_populates="invoices")
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice")


class Payment(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"), index=True, nullable=True)
    tenancy_id: Mapped[int | None] = mapped_column(ForeignKey("tenancies.id"), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_type: Mapped[str] = mapped_column(String(32), nullable=False)
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    razorpay_order_id: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    utr_number: Mapped[str | None] = mapped_column(String(24), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    invoice: Mapped[Invoice | None] = relationship(back_populates="payments")


class LedgerEntry(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "ledger_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenancy_id: Mapped[int] = mapped_column(ForeignKey("tenancies.id"), index=True, nullable=False)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id"), nullable=True)
    entry_type: Mapped[str] = mapped_column(String(32), nullable=False)
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    tenancy: Mapped["Tenancy"] = relationship(back_populates="ledger_entries")


class Expense(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    receipt_document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    maintenance_ticket_id: Mapped[int | None] = mapped_column(
        ForeignKey("maintenance_tickets.id"),
        index=True,
        nullable=True,
    )

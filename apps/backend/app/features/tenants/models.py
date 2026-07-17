from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Date

from app.db.base import AuditActorMixin, Base, SoftDeleteMixin, TimestampMixin
from app.features.documents.models import Document  # noqa: F401
from app.features.maintenance.models import MaintenanceTicket  # noqa: F401
from app.features.payments.models import Invoice, LedgerEntry  # noqa: F401
from app.features.properties.models import Unit  # noqa: F401


class Tenant(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    occupation: Mapped[str | None] = mapped_column(String(120), nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    owner_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    tenancies: Mapped[list["Tenancy"]] = relationship(back_populates="tenant")
    documents: Mapped[list["Document"]] = relationship(back_populates="tenant")
    maintenance_tickets: Mapped[list["MaintenanceTicket"]] = relationship(back_populates="tenant")


class Tenancy(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "tenancies"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), index=True, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    move_out_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    monthly_rent: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    security_deposit: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    billing_day: Mapped[int] = mapped_column(nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(24), index=True, nullable=False, default="active")
    bed_ids: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)

    tenant: Mapped[Tenant] = relationship(back_populates="tenancies")
    unit: Mapped["Unit"] = relationship(back_populates="tenancies")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="tenancy")
    ledger_entries: Mapped[list["LedgerEntry"]] = relationship(back_populates="tenancy")


class Lead(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int | None] = mapped_column(ForeignKey("properties.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    budget: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    source: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="new")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Booking(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id"), nullable=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), nullable=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), index=True, nullable=False)
    token_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    booked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

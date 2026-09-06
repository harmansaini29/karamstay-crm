from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditActorMixin, Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.features.maintenance.models import MaintenanceTicket
    from app.features.tenants.models import Tenancy


class Property(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    property_type: Mapped[str] = mapped_column(String(40), nullable=False)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    units: Mapped[list["Unit"]] = relationship(back_populates="property")
    manager_assignments: Mapped[list["ManagerPropertyAssignment"]] = relationship(
        back_populates="property",
    )


class ManagerPropertyAssignment(TimestampMixin, Base):
    __tablename__ = "manager_property_assignments"
    __table_args__ = (
        UniqueConstraint("manager_id", "property_id", name="uq_manager_property_assignment"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    property_id: Mapped[int] = mapped_column(
        ForeignKey("properties.id"),
        index=True,
        nullable=False,
    )

    property: Mapped[Property] = relationship(back_populates="manager_assignments")


class Unit(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "units"
    __table_args__ = (
        CheckConstraint("rent >= 0", name="ck_units_rent_non_negative"),
        CheckConstraint("deposit >= 0", name="ck_units_deposit_non_negative"),
        CheckConstraint("capacity > 0", name="ck_units_capacity_positive"),
        UniqueConstraint(
            "property_id",
            "building",
            "floor",
            "unit_no",
            name="uq_units_property_location",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True, nullable=False)
    building: Mapped[str | None] = mapped_column(String(80), nullable=True)
    floor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unit_no: Mapped[str] = mapped_column(String(40), nullable=False)
    unit_type: Mapped[str] = mapped_column(String(20), nullable=False)
    rent: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    deposit: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(24), index=True, nullable=False, default="vacant")
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    property: Mapped[Property] = relationship(back_populates="units")
    tenancies: Mapped[list["Tenancy"]] = relationship(back_populates="unit")
    inventory_items: Mapped[list["InventoryItem"]] = relationship(back_populates="unit")
    maintenance_tickets: Mapped[list["MaintenanceTicket"]] = relationship(back_populates="unit")
    beds: Mapped[list["Bed"]] = relationship(back_populates="unit")


class InventoryItem(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    condition: Mapped[str] = mapped_column(String(40), nullable=False, default="good")
    damage_fine_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    unit: Mapped[Unit] = relationship(back_populates="inventory_items")


class Bed(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "beds"
    __table_args__ = (UniqueConstraint("unit_id", "bed_no", name="uq_beds_unit_bed_no"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), index=True, nullable=False)
    bed_no: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(24), index=True, nullable=False, default="vacant")
    # Tiered room block: MASTER_BED | COMMON_BED | HALL (nullable for legacy rows)
    room_type: Mapped[str | None] = mapped_column(String(20), nullable=True)

    unit: Mapped[Unit] = relationship(back_populates="beds")


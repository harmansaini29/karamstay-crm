from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditActorMixin, Base, SoftDeleteMixin, TimestampMixin
from app.features.properties.models import Unit

if TYPE_CHECKING:
    from app.features.tenants.models import Tenant


class MaintenanceTicket(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "maintenance_tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    priority: Mapped[str] = mapped_column(String(24), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(24), index=True, nullable=False, default="open")
    description: Mapped[str] = mapped_column(Text, nullable=False)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant: Mapped["Tenant | None"] = relationship(back_populates="maintenance_tickets")
    unit: Mapped[Unit] = relationship(back_populates="maintenance_tickets")

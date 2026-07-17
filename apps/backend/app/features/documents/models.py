from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditActorMixin, Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.features.tenants.models import Tenant


class Document(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=True)
    property_id: Mapped[int | None] = mapped_column(ForeignKey("properties.id"), index=True, nullable=True)
    maintenance_ticket_id: Mapped[int | None] = mapped_column(
        ForeignKey("maintenance_tickets.id"),
        index=True,
        nullable=True,
    )
    document_type: Mapped[str] = mapped_column(String(60), nullable=False)
    file_key: Mapped[str] = mapped_column(String(512), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(24), index=True, nullable=False, default="pending")
    status_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status_updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    tenant: Mapped["Tenant | None"] = relationship(back_populates="documents")

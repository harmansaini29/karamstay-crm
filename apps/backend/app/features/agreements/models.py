from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditActorMixin, Base, SoftDeleteMixin, TimestampMixin


class Agreement(TimestampMixin, SoftDeleteMixin, AuditActorMixin, Base):
    __tablename__ = "agreements"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenancy_id: Mapped[int] = mapped_column(ForeignKey("tenancies.id"), index=True, nullable=False)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    # A=Standard, B=Enhanced, C=Short-Stay
    template_id: Mapped[str] = mapped_column(String(4), nullable=False, default="A")
    template_name: Mapped[str] = mapped_column(String(120), nullable=False, default="Standard Agreement")
    # form_submitted | docx_generated | offline_pending | approved
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="form_submitted")
    form_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    docx_file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    docx_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 1=form, 2=docx, 3=offline, 4=approved
    tracker_stage: Mapped[int] = mapped_column(nullable=False, default=1)

    offline_uploads: Mapped[list["AgreementOfflineUpload"]] = relationship(back_populates="agreement")


class AgreementOfflineUpload(TimestampMixin, AuditActorMixin, Base):
    __tablename__ = "agreement_offline_uploads"

    id: Mapped[int] = mapped_column(primary_key=True)
    agreement_id: Mapped[int] = mapped_column(ForeignKey("agreements.id"), index=True, nullable=False)
    # stamp_paper | police_noc | notary_stamp
    upload_type: Mapped[str] = mapped_column(String(32), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # PENDING | STAMPED | NOTARIZED | APPROVED
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    agreement: Mapped[Agreement] = relationship(back_populates="offline_uploads")

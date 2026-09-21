from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.agreements.models import Agreement, AgreementOfflineUpload


class AgreementRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_agreements(self, *, tenant_id: int | None = None, tenancy_id: int | None = None) -> list[Agreement]:
        stmt = select(Agreement).where(Agreement.deleted_at.is_(None))
        if tenant_id is not None:
            stmt = stmt.where(Agreement.tenant_id == tenant_id)
        if tenancy_id is not None:
            stmt = stmt.where(Agreement.tenancy_id == tenancy_id)
        return list(self.db.scalars(stmt.order_by(Agreement.created_at.desc())))

    def list_for_tenant(self, tenant_id: int) -> list[Agreement]:
        return self.list_agreements(tenant_id=tenant_id)

    def get(self, agreement_id: int) -> Agreement | None:
        return self.db.scalar(
            select(Agreement).where(Agreement.id == agreement_id, Agreement.deleted_at.is_(None))
        )

    def get_by_tenancy(self, tenancy_id: int) -> Agreement | None:
        return self.db.scalar(
            select(Agreement).where(Agreement.tenancy_id == tenancy_id, Agreement.deleted_at.is_(None))
        )

    def add(self, agreement: Agreement) -> Agreement:
        self.db.add(agreement)
        return agreement

    def list_uploads(self, agreement_id: int) -> list[AgreementOfflineUpload]:
        stmt = select(AgreementOfflineUpload).where(
            AgreementOfflineUpload.agreement_id == agreement_id
        ).order_by(AgreementOfflineUpload.uploaded_at.desc())
        return list(self.db.scalars(stmt))

    def add_upload(self, upload: AgreementOfflineUpload) -> AgreementOfflineUpload:
        self.db.add(upload)
        return upload

    def get_upload(self, upload_id: int) -> AgreementOfflineUpload | None:
        return self.db.scalar(
            select(AgreementOfflineUpload).where(AgreementOfflineUpload.id == upload_id)
        )

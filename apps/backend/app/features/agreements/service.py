from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import utc_now
from app.features.agreements.models import Agreement, AgreementOfflineUpload
from app.features.agreements.repository import AgreementRepository
from app.features.agreements.schemas import (
    AgreementCreate,
    AgreementUpdate,
    OfflineUploadCreate,
    OfflineUploadStatusUpdate,
)
from app.features.auth.models import User
from app.features.tenants.repository import TenantRepository


class AgreementService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = AgreementRepository(db)
        self.tenant_repo = TenantRepository(db)

    def _assert_access(self, current_user: User) -> None:
        if current_user.role.name not in ("owner", "manager", "staff", "accountant"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    def list_agreements(
        self,
        current_user: User,
        *,
        tenant_id: int | None = None,
        tenancy_id: int | None = None,
    ) -> list[Agreement]:
        role = current_user.role.name
        if role == "tenant":
            tenant = self.tenant_repo.get_tenant_by_user_id(current_user.id)
            if tenant is None:
                return []
            return self.repo.list_agreements(tenant_id=tenant.id, tenancy_id=tenancy_id)
        self._assert_access(current_user)
        return self.repo.list_agreements(tenant_id=tenant_id, tenancy_id=tenancy_id)

    def get_agreement(self, agreement_id: int, current_user: User) -> Agreement:
        agreement = self.repo.get(agreement_id)
        if agreement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")
        role = current_user.role.name
        if role == "tenant":
            tenant = self.tenant_repo.get_tenant_by_user_id(current_user.id)
            if tenant is None or agreement.tenant_id != tenant.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        else:
            self._assert_access(current_user)
        return agreement

    def list_for_tenant(self, tenant_id: int, current_user: User) -> list[Agreement]:
        return self.list_agreements(current_user, tenant_id=tenant_id)

    def create(self, payload: AgreementCreate, current_user: User) -> Agreement:
        self._assert_access(current_user)
        # Upsert: if one already exists for this tenancy, return it
        existing = self.repo.get_by_tenancy(payload.tenancy_id)
        if existing:
            return existing

        agreement = Agreement(
            tenancy_id=payload.tenancy_id,
            tenant_id=payload.tenant_id,
            template_id=payload.template_id,
            template_name=payload.template_name,
            status="form_submitted",
            tracker_stage=1,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repo.add(agreement)
        self.db.commit()
        self.db.refresh(agreement)
        return agreement

    def update(self, agreement_id: int, payload: AgreementUpdate, current_user: User) -> Agreement:
        agreement = self.repo.get(agreement_id)
        if agreement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")

        role = current_user.role.name
        if role == "tenant":
            tenant = self.tenant_repo.get_tenant_by_user_id(current_user.id)
            if tenant is None or agreement.tenant_id != tenant.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
            if payload.form_data is not None:
                agreement.form_data = payload.form_data
                agreement.tracker_stage = max(agreement.tracker_stage, 1)
        else:
            self._assert_access(current_user)
            if payload.status is not None:
                agreement.status = payload.status
            if payload.tracker_stage is not None:
                agreement.tracker_stage = payload.tracker_stage
            if payload.form_data is not None:
                agreement.form_data = payload.form_data
            if payload.docx_file_name is not None:
                agreement.docx_file_name = payload.docx_file_name
                agreement.docx_generated_at = utc_now()

        agreement.updated_by_id = current_user.id
        self.db.commit()
        self.db.refresh(agreement)
        return agreement

    def compile_docx(self, agreement_id: int, current_user: User) -> Agreement:
        """Mark agreement as docx-generated and advance tracker stage."""
        agreement = self.repo.get(agreement_id)
        if agreement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")

        role = current_user.role.name
        if role == "tenant":
            tenant = self.tenant_repo.get_tenant_by_user_id(current_user.id)
            if tenant is None or agreement.tenant_id != tenant.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        else:
            self._assert_access(current_user)

        agreement.status = "docx_generated"
        agreement.tracker_stage = max(agreement.tracker_stage, 2)
        agreement.docx_file_name = f"agreement_{agreement_id}_{agreement.template_id}.docx"
        agreement.docx_generated_at = utc_now()
        agreement.updated_by_id = current_user.id
        self.db.commit()
        self.db.refresh(agreement)
        return agreement

    def list_uploads(self, agreement_id: int, current_user: User) -> list[AgreementOfflineUpload]:
        self._assert_access(current_user)
        agreement = self.repo.get(agreement_id)
        if agreement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")
        return self.repo.list_uploads(agreement_id)

    def add_upload(
        self, agreement_id: int, payload: OfflineUploadCreate, current_user: User
    ) -> AgreementOfflineUpload:
        self._assert_access(current_user)
        agreement = self.repo.get(agreement_id)
        if agreement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")

        upload = AgreementOfflineUpload(
            agreement_id=agreement_id,
            upload_type=payload.upload_type,
            file_name=payload.file_name,
            status="PENDING",
            notes=payload.notes,
            uploaded_at=utc_now(),
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repo.add_upload(upload)

        # Advance agreement to offline_pending stage if not already further
        if agreement.tracker_stage < 3:
            agreement.tracker_stage = 3
            agreement.status = "offline_pending"
            agreement.updated_by_id = current_user.id

        self.db.commit()
        self.db.refresh(upload)
        return upload

    def update_upload_status(
        self, agreement_id: int, upload_id: int, payload: OfflineUploadStatusUpdate, current_user: User
    ) -> AgreementOfflineUpload:
        self._assert_access(current_user)
        upload = self.repo.get_upload(upload_id)
        if upload is None or upload.agreement_id != agreement_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

        upload.status = payload.status
        upload.updated_by_id = current_user.id
        self.db.commit()
        self.db.refresh(upload)
        return upload

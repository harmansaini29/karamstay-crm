import base64
import logging
import re

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import utc_now
from app.core.storage import get_storage
from app.features.agreements.docx_generator import build_agreement_docx, build_agreement_pdf
from app.features.agreements.models import Agreement, AgreementOfflineUpload
from app.features.agreements.repository import AgreementRepository
from app.features.agreements.schemas import (
    AgreementApproveResponse,
    AgreementCreate,
    AgreementKycSubmit,
    AgreementResponse,
    AgreementUpdate,
    OfflineUploadCreate,
    OfflineUploadStatusUpdate,
)
from app.features.auth.models import Role, User
from app.features.documents.models import Document
from app.features.notifications.models import Notification
from app.features.properties.repository import PropertyRepository
from app.features.tenants.repository import TenantRepository

logger = logging.getLogger(__name__)


def _sanitize_slug(val: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_\-]", "_", (val or "").strip())
    return cleaned or "default"


class AgreementService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = AgreementRepository(db)
        self.tenant_repo = TenantRepository(db)
        self.prop_repo = PropertyRepository(db)
        self.storage = get_storage()

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
            agreements = self.repo.list_agreements(tenant_id=tenant.id, tenancy_id=tenancy_id)
            if not agreements:
                # If tenant has an active tenancy, ensure an Agreement exists immediately
                tenancy = self.tenant_repo.get_active_tenancy_for_tenant(tenant.id)
                if tenancy:
                    auto_ag = Agreement(
                        tenancy_id=tenancy.id,
                        tenant_id=tenant.id,
                        template_id="A",
                        template_name="Standard Agreement",
                        status="form_submitted",
                        tracker_stage=1,
                        created_by_id=current_user.id,
                        updated_by_id=current_user.id,
                    )
                    self.repo.add(auto_ag)
                    self.db.commit()
                    self.db.refresh(auto_ag)
                    return [auto_ag]
            return agreements
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
            if payload.tenant_photo_key is not None:
                agreement.tenant_photo_key = payload.tenant_photo_key
            if payload.aadhar_card_key is not None:
                agreement.aadhar_card_key = payload.aadhar_card_key
            if payload.signature_key is not None:
                agreement.signature_key = payload.signature_key
            if payload.s3_folder_path is not None:
                agreement.s3_folder_path = payload.s3_folder_path
            if payload.s3_archive_url is not None:
                agreement.s3_archive_url = payload.s3_archive_url

        agreement.updated_by_id = current_user.id
        self.db.commit()
        self.db.refresh(agreement)
        return agreement

    def submit_kyc(self, agreement_id: int, payload: AgreementKycSubmit, current_user: User) -> Agreement:
        """Tenant submits agreement details along with photo, Aadhaar card, and signature."""
        agreement = self.repo.get(agreement_id)
        if agreement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")

        role = current_user.role.name
        tenant = None
        if role == "tenant":
            tenant = self.tenant_repo.get_tenant_by_user_id(current_user.id)
            if tenant is None or agreement.tenant_id != tenant.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        else:
            self._assert_access(current_user)
            tenant = self.tenant_repo.get_tenant(agreement.tenant_id)

        agreement.form_data = payload.form_data

        # Decode & store images
        def _save_b64(data_b64: str, file_prefix: str, content_type: str) -> str:
            if "," in data_b64:
                data_b64 = data_b64.split(",", 1)[1]
            raw = base64.b64decode(data_b64)
            key = f"kyc/ag_{agreement_id}_{file_prefix}"
            self.storage.upload_bytes(key=key, data=raw, content_type=content_type)
            return key

        photo_bytes = None
        aadhar_bytes = None
        signature_bytes = None

        if payload.tenant_photo_base64:
            b64 = payload.tenant_photo_base64
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            photo_bytes = base64.b64decode(b64)
            key = f"kyc/ag_{agreement_id}_photo.jpg"
            self.storage.upload_bytes(key=key, data=photo_bytes, content_type="image/jpeg")
            agreement.tenant_photo_key = key

        if payload.aadhar_card_base64:
            b64 = payload.aadhar_card_base64
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            aadhar_bytes = base64.b64decode(b64)
            key = f"kyc/ag_{agreement_id}_aadhar.jpg"
            self.storage.upload_bytes(key=key, data=aadhar_bytes, content_type="image/jpeg")
            agreement.aadhar_card_key = key

        if payload.signature_base64:
            b64 = payload.signature_base64
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            signature_bytes = base64.b64decode(b64)
            key = f"kyc/ag_{agreement_id}_signature.png"
            self.storage.upload_bytes(key=key, data=signature_bytes, content_type="image/png")
            agreement.signature_key = key

        # Automatically compile the Word and PDF documents
        tenancy = self.tenant_repo.get_tenancy(agreement.tenancy_id)
        unit = self.prop_repo.get_unit(tenancy.unit_id) if tenancy else None
        property_ = self.prop_repo.get_property(unit.property_id) if unit else None

        docx_bytes = build_agreement_docx(agreement, tenant, tenancy, unit, property_)
        pdf_bytes = build_agreement_pdf(
            agreement,
            tenant,
            tenancy,
            unit,
            property_,
            photo_bytes=photo_bytes,
            aadhar_bytes=aadhar_bytes,
            signature_bytes=signature_bytes,
        )

        docx_key = f"agreements/ag_{agreement_id}_{agreement.template_id}.docx"
        pdf_key = f"agreements/ag_{agreement_id}_{agreement.template_id}.pdf"
        self.storage.upload_bytes(
            key=docx_key,
            data=docx_bytes,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        self.storage.upload_bytes(key=pdf_key, data=pdf_bytes, content_type="application/pdf")

        agreement.docx_file_name = f"agreement_{agreement_id}_{agreement.template_id}.docx"
        agreement.docx_generated_at = utc_now()
        agreement.status = "docx_generated"
        agreement.tracker_stage = max(agreement.tracker_stage, 2)
        agreement.updated_by_id = current_user.id

        # Notify Owner and Staff on the spot
        staff_stmt = (
            select(User.id)
            .join(Role, Role.id == User.role_id)
            .where(Role.name.in_(["owner", "staff", "manager"]), User.is_active.is_(True), User.deleted_at.is_(None))
        )
        staff_ids = list(self.db.scalars(staff_stmt))
        for s_id in staff_ids:
            self.db.add(
                Notification(
                    user_id=s_id,
                    channel="in_app",
                    notification_type="tenant_agreement_submitted",
                    title="Agreement & KYC Submitted",
                    message=(
                        f"Tenant {tenant.name} has submitted agreement form and KYC documents "
                        "(Aadhaar & photo) for review."
                    ),
                    status="unread",
                )
            )

        self.db.commit()
        self.db.refresh(agreement)
        return agreement

    def compile_docx(self, agreement_id: int, current_user: User) -> Agreement:
        """Mark agreement as docx-generated, compile valid .docx and .pdf files, and advance tracker stage."""
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
            tenant = self.tenant_repo.get_tenant(agreement.tenant_id)

        tenancy = self.tenant_repo.get_tenancy(agreement.tenancy_id)
        unit = self.prop_repo.get_unit(tenancy.unit_id) if tenancy else None
        property_ = self.prop_repo.get_property(unit.property_id) if unit else None

        def _get_stored(k: str | None) -> bytes | None:
            return self.storage.get_bytes(key=k) if k and self.storage.object_exists(key=k) else None

        photo_bytes = _get_stored(agreement.tenant_photo_key)
        aadhar_bytes = _get_stored(agreement.aadhar_card_key)
        signature_bytes = _get_stored(agreement.signature_key)

        offline_doc_items = []
        for upload in agreement.offline_uploads:
            if upload.s3_key and self.storage.object_exists(key=upload.s3_key):
                raw = self.storage.get_bytes(key=upload.s3_key)
                if raw:
                    doc_label = f"{upload.upload_type.replace('_', ' ').title()} - {upload.file_name}"
                    offline_doc_items.append((doc_label, raw))

        docx_bytes = build_agreement_docx(agreement, tenant, tenancy, unit, property_)
        pdf_bytes = build_agreement_pdf(
            agreement,
            tenant,
            tenancy,
            unit,
            property_,
            photo_bytes=photo_bytes,
            aadhar_bytes=aadhar_bytes,
            signature_bytes=signature_bytes,
            offline_doc_items=offline_doc_items,
        )

        docx_key = f"agreements/ag_{agreement_id}_{agreement.template_id}.docx"
        pdf_key = f"agreements/ag_{agreement_id}_{agreement.template_id}.pdf"
        self.storage.upload_bytes(
            key=docx_key,
            data=docx_bytes,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        self.storage.upload_bytes(key=pdf_key, data=pdf_bytes, content_type="application/pdf")

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

        s3_key = f"offline_uploads/ag_{agreement_id}_{payload.upload_type}_{payload.file_name}"
        file_url = None
        if payload.file_base64:
            b64 = payload.file_base64
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            raw = base64.b64decode(b64)
            self.storage.upload_bytes(key=s3_key, data=raw, content_type="image/jpeg")
            file_url = self.storage.presign_download(key=s3_key)

        upload = AgreementOfflineUpload(
            agreement_id=agreement_id,
            upload_type=payload.upload_type,
            file_name=payload.file_name,
            status="PENDING",
            notes=payload.notes,
            s3_key=s3_key,
            file_url=file_url,
            uploaded_at=utc_now(),
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repo.add_upload(upload)

        if agreement.tracker_stage < 3:
            agreement.tracker_stage = 3
            agreement.status = "offline_pending"
            agreement.updated_by_id = current_user.id

        self.db.commit()
        self.db.refresh(upload)
        return upload

    def get_download_url(self, agreement_id: int, doc_type: str, current_user: User) -> dict[str, str]:
        agreement = self.get_agreement(agreement_id, current_user)
        key = None
        file_name = None
        if doc_type == "docx":
            if not agreement.docx_file_name:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Docx not generated yet")
            key = f"agreements/ag_{agreement.id}_{agreement.template_id}.docx"
            file_name = agreement.docx_file_name
        elif doc_type == "pdf":
            key = f"agreements/ag_{agreement.id}_{agreement.template_id}.pdf"
            file_name = f"agreement_{agreement.id}_{agreement.template_id}.pdf"
        elif doc_type == "photo":
            key = agreement.tenant_photo_key
            file_name = "tenant_photo.jpg"
        elif doc_type == "aadhar":
            key = agreement.aadhar_card_key
            file_name = "aadhar_card.jpg"
        elif doc_type == "signature":
            key = agreement.signature_key
            file_name = "signature.png"
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid doc_type: {doc_type}")

        if not key or not self.storage.object_exists(key=key):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{doc_type} file not found in storage")

        url = self.storage.presign_download(key=key)
        return {"download_url": url, "file_name": file_name}


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

    def archive_agreement_to_s3(self, agreement_id: int, current_user: User) -> AgreementApproveResponse:
        """Owner approval: packages tenant photo, Aadhaar, signature, offline docs, and agreement into AWS S3."""
        if current_user.role.name not in ("owner", "manager"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Only owner or manager can approve and archive to S3"
            )

        agreement = self.repo.get(agreement_id)
        if agreement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")

        tenant = self.tenant_repo.get_tenant(agreement.tenant_id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant record not found")

        tenancy = self.tenant_repo.get_tenancy(agreement.tenancy_id)
        unit = self.prop_repo.get_unit(tenancy.unit_id) if tenancy else None
        property_ = self.prop_repo.get_property(unit.property_id) if unit else None

        safe_tenant = _sanitize_slug(tenant.name)
        safe_unit = _sanitize_slug(f"Room_{unit.unit_no}" if unit else "Unit")
        s3_folder = f"tenants/{safe_tenant}_{tenant.id}/{safe_unit}"

        archived_files: list[str] = []

        # Load all verification images and offline uploads so the compiled agreement PDF embeds them
        def _get_stored(k: str | None) -> bytes | None:
            return self.storage.get_bytes(key=k) if k and self.storage.object_exists(key=k) else None

        photo_bytes = _get_stored(agreement.tenant_photo_key)
        aadhar_bytes = _get_stored(agreement.aadhar_card_key)
        signature_bytes = _get_stored(agreement.signature_key)

        offline_doc_items = []
        for upload in agreement.offline_uploads:
            if upload.s3_key and self.storage.object_exists(key=upload.s3_key):
                raw = self.storage.get_bytes(key=upload.s3_key)
                if raw:
                    doc_label = f"{upload.upload_type.replace('_', ' ').title()} - {upload.file_name}"
                    offline_doc_items.append((doc_label, raw))

        # 1. Compile & upload docx
        docx_bytes = build_agreement_docx(agreement, tenant, tenancy, unit, property_)
        docx_dest_key = f"{s3_folder}/agreement_{agreement.id}_{agreement.template_id}.docx"
        self.storage.upload_bytes(
            key=docx_dest_key,
            data=docx_bytes,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        archived_files.append(docx_dest_key)
        self.db.add(
            Document(
                tenant_id=tenant.id,
                property_id=unit.property_id if unit else None,
                document_type="agreement",
                file_key=docx_dest_key,
                file_name=f"Agreement_{agreement.template_name}.docx",
                content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                status="approved",
                status_updated_at=utc_now(),
                status_updated_by_id=current_user.id,
            )
        )

        # 2. Compile & upload complete PDF with all pics embedded
        pdf_bytes = build_agreement_pdf(
            agreement,
            tenant,
            tenancy,
            unit,
            property_,
            photo_bytes=photo_bytes,
            aadhar_bytes=aadhar_bytes,
            signature_bytes=signature_bytes,
            offline_doc_items=offline_doc_items,
        )
        pdf_dest_key = f"{s3_folder}/agreement_{agreement.id}_{agreement.template_id}.pdf"
        self.storage.upload_bytes(key=pdf_dest_key, data=pdf_bytes, content_type="application/pdf")
        archived_files.append(pdf_dest_key)
        self.db.add(
            Document(
                tenant_id=tenant.id,
                property_id=unit.property_id if unit else None,
                document_type="agreement",
                file_key=pdf_dest_key,
                file_name=f"Agreement_{agreement.template_name}.pdf",
                content_type="application/pdf",
                status="approved",
                status_updated_at=utc_now(),
                status_updated_by_id=current_user.id,
            )
        )

        # 3. Tenant Photo
        if agreement.tenant_photo_key and self.storage.object_exists(key=agreement.tenant_photo_key):
            photo_data = self.storage.get_bytes(key=agreement.tenant_photo_key)
            if photo_data:
                photo_dest_key = f"{s3_folder}/tenant_photo_{safe_tenant}.jpg"
                self.storage.upload_bytes(key=photo_dest_key, data=photo_data, content_type="image/jpeg")
                archived_files.append(photo_dest_key)
                self.db.add(
                    Document(
                        tenant_id=tenant.id,
                        property_id=unit.property_id if unit else None,
                        document_type="tenant_photo",
                        file_key=photo_dest_key,
                        file_name="Tenant Photograph",
                        content_type="image/jpeg",
                        status="approved",
                        status_updated_at=utc_now(),
                        status_updated_by_id=current_user.id,
                    )
                )

        # 4. Aadhaar Card
        if agreement.aadhar_card_key and self.storage.object_exists(key=agreement.aadhar_card_key):
            aadhar_data = self.storage.get_bytes(key=agreement.aadhar_card_key)
            if aadhar_data:
                aadhar_dest_key = f"{s3_folder}/aadhar_card_{safe_tenant}.jpg"
                self.storage.upload_bytes(key=aadhar_dest_key, data=aadhar_data, content_type="image/jpeg")
                archived_files.append(aadhar_dest_key)
                self.db.add(
                    Document(
                        tenant_id=tenant.id,
                        property_id=unit.property_id if unit else None,
                        document_type="identity",
                        file_key=aadhar_dest_key,
                        file_name="Aadhaar Card Proof",
                        content_type="image/jpeg",
                        status="approved",
                        status_updated_at=utc_now(),
                        status_updated_by_id=current_user.id,
                    )
                )

        # 5. Signature
        if agreement.signature_key and self.storage.object_exists(key=agreement.signature_key):
            sign_data = self.storage.get_bytes(key=agreement.signature_key)
            if sign_data:
                sign_dest_key = f"{s3_folder}/signature_{safe_tenant}.png"
                self.storage.upload_bytes(key=sign_dest_key, data=sign_data, content_type="image/png")
                archived_files.append(sign_dest_key)
                self.db.add(
                    Document(
                        tenant_id=tenant.id,
                        property_id=unit.property_id if unit else None,
                        document_type="signature",
                        file_key=sign_dest_key,
                        file_name="Tenant Signature",
                        content_type="image/png",
                        status="approved",
                        status_updated_at=utc_now(),
                        status_updated_by_id=current_user.id,
                    )
                )

        # 6. Offline uploads (stamp paper, police NOC, notary stamp)
        for upload in agreement.offline_uploads:
            dest_key = f"{s3_folder}/{upload.upload_type}_{upload.id}_{upload.file_name}"
            upload_data = self.storage.get_bytes(key=upload.s3_key) if upload.s3_key else None
            if upload_data:
                self.storage.upload_bytes(key=dest_key, data=upload_data, content_type="image/jpeg")
            upload.status = "APPROVED"
            upload.s3_key = dest_key
            upload.file_url = self.storage.presign_download(key=dest_key)
            upload.updated_by_id = current_user.id
            archived_files.append(dest_key)
            self.db.add(
                Document(
                    tenant_id=tenant.id,
                    property_id=unit.property_id if unit else None,
                    document_type=upload.upload_type,
                    file_key=dest_key,
                    file_name=f"{upload.upload_type.replace('_', ' ').title()} - {upload.file_name}",
                    content_type="image/jpeg",
                    status="approved",
                    status_updated_at=utc_now(),
                    status_updated_by_id=current_user.id,
                )
            )

        # Update Agreement status to approved and stage 4
        agreement.status = "approved"
        agreement.tracker_stage = 4
        agreement.s3_folder_path = s3_folder
        agreement.s3_archive_url = self.storage.presign_download(key=pdf_dest_key)
        agreement.updated_by_id = current_user.id

        # In-app notification to tenant
        if tenant.user_id:
            self.db.add(
                Notification(
                    user_id=tenant.user_id,
                    channel="in_app",
                    notification_type="agreement_approved",
                    title="Rental Agreement Approved & Archived",
                    message=(
                        "Your rental agreement, photograph, and identity documents have been approved by the "
                        "owner and stored in your Legal Vault."
                    ),
                    status="unread",
                )
            )

        self.db.commit()
        self.db.refresh(agreement)
        return AgreementApproveResponse(
            agreement=AgreementResponse.model_validate(agreement),
            s3_folder_path=s3_folder,
            archived_files=archived_files,
            message="Agreement, KYC documents, and offline verifications successfully archived into AWS S3 storage.",
        )

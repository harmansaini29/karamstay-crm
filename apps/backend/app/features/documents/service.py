from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.audit import AuditLogService
from app.core.security import utc_now
from app.core.storage import get_storage
from app.features.auth.models import User
from app.features.documents.models import Document
from app.features.documents.repository import DocumentRepository
from app.features.documents.schemas import DocumentCreate, DocumentStatusUpdate, PresignUploadRequest
from app.features.properties.repository import PropertyRepository


class DocumentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DocumentRepository(db)
        self.property_repository = PropertyRepository(db)
        self.audit = AuditLogService(db)

    def _assert_can_manage_target(self, current_user: User, *, tenant_id: int | None, property_id: int | None) -> None:
        if current_user.role.name != "manager":
            return
        if tenant_id is not None and not self.repository.manager_can_access_tenant(current_user.id, tenant_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")
        if property_id is not None and not self.repository.manager_can_access_property(
            current_user.id,
            property_id,
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Property access denied")

    def presign_upload(self, payload: PresignUploadRequest, current_user: User) -> dict[str, str]:
        self._assert_can_manage_target(
            current_user,
            tenant_id=payload.tenant_id,
            property_id=payload.property_id,
        )
        storage = get_storage()
        if payload.tenant_id:
            prefix = f"documents/tenant-{payload.tenant_id}"
        else:
            prefix = f"documents/property-{payload.property_id}"
        key = storage.build_key(prefix=prefix, file_name=payload.file_name)
        upload_url = storage.presign_upload(key=key, content_type=payload.content_type)
        return {"upload_url": upload_url, "file_key": key}

    def create_document(self, payload: DocumentCreate, current_user: User) -> Document:
        self._assert_can_manage_target(
            current_user,
            tenant_id=payload.tenant_id,
            property_id=payload.property_id,
        )
        document = Document(
            tenant_id=payload.tenant_id,
            property_id=payload.property_id,
            maintenance_ticket_id=payload.maintenance_ticket_id,
            document_type=payload.document_type,
            file_key=payload.file_key,
            file_name=payload.file_name,
            content_type=payload.content_type,
            uploaded_by_id=current_user.id,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.add_document(document)
        self.db.flush()
        self.audit.record(
            user_id=current_user.id,
            action="document.create",
            entity_type="document",
            entity_id=document.id,
        )
        self.db.commit()
        self.db.refresh(document)
        return document

    def list_documents(self, current_user: User) -> list[Document]:
        role = current_user.role.name
        if role in ("owner", "accountant"):
            return self.repository.list_all()
        if role == "manager":
            return self.repository.list_for_manager(current_user.id)
        tenant = self.repository.get_tenant_by_user_id(current_user.id)
        if tenant is None:
            return []
        return self.repository.list_for_tenant(tenant.id)

    def _get_document_for_user(self, document_id: int, current_user: User) -> Document:
        document = self.repository.get_document(document_id)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        role = current_user.role.name
        if role == "tenant":
            tenant = self.repository.get_tenant_by_user_id(current_user.id)
            if tenant is None or document.tenant_id != tenant.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Document access denied")
        elif role == "manager":
            self._assert_can_manage_target(
                current_user,
                tenant_id=document.tenant_id,
                property_id=document.property_id,
            )
        return document

    def get_download_url(self, document_id: int, current_user: User) -> str:
        document = self._get_document_for_user(document_id, current_user)
        storage = get_storage()
        self.audit.record(
            user_id=current_user.id,
            action="document.download",
            entity_type="document",
            entity_id=document.id,
        )
        self.db.commit()
        return storage.presign_download(key=document.file_key)

    def get_document_for_user(self, document_id: int, current_user: User) -> Document:
        return self._get_document_for_user(document_id, current_user)

    def update_status(self, document_id: int, payload: DocumentStatusUpdate, current_user: User) -> Document:
        document = self._get_document_for_user(document_id, current_user)
        document.status = payload.status
        document.status_updated_at = utc_now()
        document.status_updated_by_id = current_user.id
        document.rejection_reason = payload.rejection_reason if payload.status == "rejected" else None
        self.audit.record(
            user_id=current_user.id,
            action="document.status_update",
            entity_type="document",
            entity_id=document.id,
            metadata={"status": payload.status},
        )
        self.db.commit()
        self.db.refresh(document)
        return document

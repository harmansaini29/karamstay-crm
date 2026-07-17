from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.db.session import get_db
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User
from app.features.documents.schemas import (
    DocumentCreate,
    DocumentDownloadResponse,
    DocumentResponse,
    DocumentStatusUpdate,
    PresignUploadRequest,
    PresignUploadResponse,
)
from app.features.documents.service import DocumentService

router = APIRouter()
OwnerManagerUser = Annotated[User, Depends(require_roles(["owner", "manager"]))]
AnyUser = Annotated[User, Depends(require_roles(["owner", "manager", "accountant", "tenant"]))]
DbSession = Annotated[Session, Depends(get_db)]


@router.post("/documents/presign-upload", response_model=PresignUploadResponse)
@limiter.limit("20/minute")
def presign_upload(
    request: Request,
    payload: PresignUploadRequest,
    current_user: OwnerManagerUser,
    db: DbSession,
) -> PresignUploadResponse:
    return PresignUploadResponse(**DocumentService(db).presign_upload(payload, current_user))


@router.post("/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document(payload: DocumentCreate, current_user: OwnerManagerUser, db: DbSession) -> DocumentResponse:
    return DocumentService(db).create_document(payload, current_user)


@router.get("/documents", response_model=list[DocumentResponse])
def list_documents(current_user: AnyUser, db: DbSession) -> list[DocumentResponse]:
    return DocumentService(db).list_documents(current_user)


@router.get("/documents/{document_id}", response_model=DocumentResponse)
def get_document(document_id: int, current_user: AnyUser, db: DbSession) -> DocumentResponse:
    return DocumentService(db).get_document_for_user(document_id, current_user)


@router.get("/documents/{document_id}/download", response_model=DocumentDownloadResponse)
def download_document(document_id: int, current_user: AnyUser, db: DbSession) -> DocumentDownloadResponse:
    url = DocumentService(db).get_download_url(document_id, current_user)
    return DocumentDownloadResponse(download_url=url)


@router.patch("/documents/{document_id}/status", response_model=DocumentResponse)
def update_document_status(
    document_id: int,
    payload: DocumentStatusUpdate,
    current_user: OwnerManagerUser,
    db: DbSession,
) -> DocumentResponse:
    return DocumentService(db).update_status(document_id, payload, current_user)

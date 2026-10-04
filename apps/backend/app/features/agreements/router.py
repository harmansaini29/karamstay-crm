from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.features.agreements.schemas import (
    AgreementApproveResponse,
    AgreementCreate,
    AgreementKycSubmit,
    AgreementReplaceDocxRequest,
    AgreementResponse,
    AgreementUpdate,
    OfflineUploadCreate,
    OfflineUploadResponse,
    OfflineUploadStatusUpdate,
)
from app.features.agreements.service import AgreementService
from app.features.auth.dependencies import get_current_user
from app.features.auth.models import User

router = APIRouter()


@router.get("/agreements", response_model=list[AgreementResponse])
def list_agreements(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    tenant_id: int | None = None,
    tenancy_id: int | None = None,
) -> list:
    return AgreementService(db).list_agreements(current_user, tenant_id=tenant_id, tenancy_id=tenancy_id)


@router.get("/agreements/{agreement_id}", response_model=AgreementResponse)
def get_agreement(
    agreement_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AgreementResponse:
    return AgreementService(db).get_agreement(agreement_id, current_user)


@router.post("/agreements", response_model=AgreementResponse, status_code=201)
def create_agreement(
    payload: AgreementCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return AgreementService(db).create(payload, current_user)


@router.patch("/agreements/{agreement_id}", response_model=AgreementResponse)
def update_agreement(
    agreement_id: int,
    payload: AgreementUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return AgreementService(db).update(agreement_id, payload, current_user)


@router.post("/agreements/{agreement_id}/submit-kyc", response_model=AgreementResponse)
def submit_kyc(
    agreement_id: int,
    payload: AgreementKycSubmit,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return AgreementService(db).submit_kyc(agreement_id, payload, current_user)


@router.post("/agreements/{agreement_id}/compile-docx", response_model=AgreementResponse)
def compile_docx(
    agreement_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return AgreementService(db).compile_docx(agreement_id, current_user)


@router.post("/agreements/{agreement_id}/replace-docx", response_model=AgreementResponse)
def replace_docx(
    agreement_id: int,
    payload: AgreementReplaceDocxRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AgreementResponse:
    return AgreementService(db).replace_docx(agreement_id, payload, current_user)


@router.post("/agreements/{agreement_id}/approve-and-archive", response_model=AgreementApproveResponse)
def approve_and_archive(
    agreement_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return AgreementService(db).archive_agreement_to_s3(agreement_id, current_user)


@router.get("/agreements/{agreement_id}/uploads", response_model=list[OfflineUploadResponse])
def list_uploads(
    agreement_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list:
    return AgreementService(db).list_uploads(agreement_id, current_user)


@router.post("/agreements/{agreement_id}/offline-upload", response_model=OfflineUploadResponse, status_code=201)
def add_offline_upload(
    agreement_id: int,
    payload: OfflineUploadCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return AgreementService(db).add_upload(agreement_id, payload, current_user)


@router.patch(
    "/agreements/{agreement_id}/uploads/{upload_id}",
    response_model=OfflineUploadResponse,
)
def update_upload_status(
    agreement_id: int,
    upload_id: int,
    payload: OfflineUploadStatusUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return AgreementService(db).update_upload_status(agreement_id, upload_id, payload, current_user)


@router.get("/agreements/{agreement_id}/download")
def download_agreement_file(
    agreement_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    doc_type: str = "docx",
) -> dict:
    return AgreementService(db).get_download_url(agreement_id, doc_type, current_user)


@router.get("/agreements/{agreement_id}/file")
def get_agreement_file(
    agreement_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    doc_type: str = "docx",
) -> Response:
    data, content_type, filename = AgreementService(db).get_agreement_file_bytes(agreement_id, doc_type, current_user)
    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/agreements/{agreement_id}/uploads/{upload_id}/file")
def get_upload_file(
    agreement_id: int,
    upload_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    data, content_type, filename = AgreementService(db).get_upload_file_bytes(agreement_id, upload_id, current_user)
    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )



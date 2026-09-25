from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User
from app.features.vault.schemas import (
    VaultCompileDocxRequest,
    VaultCompilePdfRequest,
    VaultOperationResponse,
    VaultTreeResponse,
    VaultUploadRequest,
)
from app.features.vault.service import VaultService

PORTAL_HTML_PATH = Path(__file__).resolve().parent / "portal.html"

router = APIRouter()

VaultStaffUser = Annotated[User, Depends(require_roles(["owner", "manager", "staff"]))]
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/vault/tree", response_model=VaultTreeResponse)
def get_vault_tree(current_user: VaultStaffUser, db: DbSession) -> VaultTreeResponse:
    return VaultService(db).get_vault_tree(current_user)


@router.post("/vault/upload", response_model=VaultOperationResponse)
def upload_vault_file(
    payload: VaultUploadRequest, current_user: VaultStaffUser, db: DbSession
) -> VaultOperationResponse:
    return VaultService(db).upload_file(payload, current_user)


@router.delete("/vault/file", response_model=VaultOperationResponse)
def delete_vault_file(
    current_user: VaultStaffUser,
    db: DbSession,
    key: Annotated[str, Query(description="S3 object key to delete")],
) -> VaultOperationResponse:
    return VaultService(db).delete_file(key, current_user)


@router.post("/vault/generate-pdf", response_model=VaultOperationResponse)
def generate_pdf_from_images(
    payload: VaultCompilePdfRequest, current_user: VaultStaffUser, db: DbSession
) -> VaultOperationResponse:
    return VaultService(db).compile_images_to_pdf(payload, current_user)


@router.post("/vault/generate-docx", response_model=VaultOperationResponse)
def generate_docx_from_images(
    payload: VaultCompileDocxRequest, current_user: VaultStaffUser, db: DbSession
) -> VaultOperationResponse:
    return VaultService(db).compile_images_to_docx(payload, current_user)


@router.get("/vault/portal", response_class=HTMLResponse)
def get_vault_portal_html() -> HTMLResponse:
    """Serve the standalone private confidential web portal interface."""
    return HTMLResponse(content=PORTAL_HTML_PATH.read_text(encoding="utf-8"))


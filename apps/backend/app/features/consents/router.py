from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User
from app.features.consents.schemas import (
    ConsentCreate,
    ConsentResponse,
    DataRequestCreate,
    DataRequestResponse,
)
from app.features.consents.service import ConsentService

router = APIRouter()
AnyUser = Annotated[User, Depends(require_roles(["owner", "manager", "accountant", "tenant"]))]
OwnerUser = Annotated[User, Depends(require_roles(["owner"]))]
DbSession = Annotated[Session, Depends(get_db)]


@router.post("/consents", response_model=ConsentResponse, status_code=status.HTTP_201_CREATED)
def record_consent(payload: ConsentCreate, current_user: AnyUser, db: DbSession) -> ConsentResponse:
    return ConsentService(db).record_consent(payload, current_user)


@router.get("/consents/me", response_model=list[ConsentResponse])
def list_my_consents(current_user: AnyUser, db: DbSession) -> list[ConsentResponse]:
    return ConsentService(db).list_my_consents(current_user)


@router.post(
    "/users/me/data-export-request",
    response_model=DataRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_data_export_request(current_user: AnyUser, db: DbSession) -> DataRequestResponse:
    return ConsentService(db).create_data_request(DataRequestCreate(request_type="export"), current_user)


@router.post(
    "/users/me/deletion-request",
    response_model=DataRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_deletion_request(current_user: AnyUser, db: DbSession) -> DataRequestResponse:
    return ConsentService(db).create_data_request(DataRequestCreate(request_type="deletion"), current_user)


@router.get("/data-requests", response_model=list[DataRequestResponse])
def list_data_requests(current_user: OwnerUser, db: DbSession) -> list[DataRequestResponse]:
    return ConsentService(db).list_all_data_requests(current_user)


@router.patch("/data-requests/{data_request_id}/resolve", response_model=DataRequestResponse)
def resolve_data_request(data_request_id: int, current_user: OwnerUser, db: DbSession) -> DataRequestResponse:
    return ConsentService(db).resolve_data_request(data_request_id, current_user)

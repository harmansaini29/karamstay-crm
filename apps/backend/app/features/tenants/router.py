from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User
from app.features.tenants.schemas import (
    TenancyCheckoutRequest,
    TenancyCheckoutResponse,
    TenancyContextResponse,
    TenancyCreate,
    TenancyResponse,
    TenantCreate,
    TenantResponse,
    TenantUpdate,
)
from app.features.tenants.service import TenantService

router = APIRouter()
OwnerManagerUser = Annotated[User, Depends(require_roles(["owner", "manager"]))]
AnyUser = Annotated[User, Depends(require_roles(["owner", "manager", "accountant", "tenant"]))]
TenantSelfUser = Annotated[User, Depends(require_roles(["tenant"]))]
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/tenants", response_model=list[TenantResponse])
def list_tenants(current_user: OwnerManagerUser, db: DbSession) -> list[TenantResponse]:
    return TenantService(db).list_tenants(current_user)


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
def create_tenant(payload: TenantCreate, current_user: OwnerManagerUser, db: DbSession) -> TenantResponse:
    return TenantService(db).create_tenant(payload, current_user)


@router.get("/tenants/me", response_model=TenantResponse)
def get_my_tenant_profile(current_user: TenantSelfUser, db: DbSession) -> TenantResponse:
    return TenantService(db).get_my_profile(current_user)


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
def get_tenant(tenant_id: int, current_user: AnyUser, db: DbSession) -> TenantResponse:
    return TenantService(db).get_tenant_for_user(tenant_id, current_user)


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
def update_tenant(
    tenant_id: int,
    payload: TenantUpdate,
    current_user: OwnerManagerUser,
    db: DbSession,
) -> TenantResponse:
    return TenantService(db).update_tenant(tenant_id, payload, current_user)


@router.post("/tenancies", response_model=TenancyResponse, status_code=status.HTTP_201_CREATED)
def check_in(payload: TenancyCreate, current_user: OwnerManagerUser, db: DbSession) -> TenancyResponse:
    return TenantService(db).check_in(payload, current_user)


@router.get("/tenancies", response_model=list[TenancyResponse])
def list_tenancies(
    current_user: OwnerManagerUser,
    db: DbSession,
    tenant_id: int | None = None,
    property_id: int | None = None,
) -> list[TenancyResponse]:
    return TenantService(db).list_tenancies(current_user, tenant_id=tenant_id, property_id=property_id)


@router.get("/tenancies/me", response_model=TenancyContextResponse)
def get_my_tenancy(current_user: TenantSelfUser, db: DbSession) -> TenancyContextResponse:
    return TenancyContextResponse(**TenantService(db).get_my_tenancy_context(current_user))


@router.get("/tenancies/{tenancy_id}", response_model=TenancyResponse)
def get_tenancy(tenancy_id: int, current_user: AnyUser, db: DbSession) -> TenancyResponse:
    return TenantService(db).get_tenancy_detail(tenancy_id, current_user)


@router.post("/tenancies/{tenancy_id}/checkout", response_model=TenancyCheckoutResponse)
def checkout(
    tenancy_id: int,
    payload: TenancyCheckoutRequest,
    current_user: OwnerManagerUser,
    db: DbSession,
) -> TenancyCheckoutResponse:
    service = TenantService(db)
    tenancy, outstanding_dues, damage_deduction, deposit_refund = service.checkout(
        tenancy_id,
        payload,
        current_user,
    )
    return TenancyCheckoutResponse(
        tenancy=TenancyResponse.model_validate(tenancy),
        outstanding_dues=outstanding_dues,
        damage_deduction=damage_deduction,
        deposit_refund=deposit_refund,
    )

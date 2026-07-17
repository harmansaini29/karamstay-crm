from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.db.session import get_db
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User
from app.features.payments.schemas import (
    ExpenseCreate,
    ExpenseResponse,
    InvoiceCreate,
    InvoiceResponse,
    LedgerEntryResponse,
    PaymentResponse,
    PaymentVerifyRequest,
    UpiSubmitRequest,
)
from app.features.payments.service import PaymentService

router = APIRouter()
AnyUser = Annotated[User, Depends(require_roles(["owner", "manager", "accountant", "tenant"]))]
FinanceUser = Annotated[User, Depends(require_roles(["owner", "manager", "accountant"]))]
TenantUser = Annotated[User, Depends(require_roles(["tenant"]))]
OwnerManagerUser = Annotated[User, Depends(require_roles(["owner", "manager"]))]
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/invoices", response_model=list[InvoiceResponse])
def list_invoices(current_user: AnyUser, db: DbSession) -> list[InvoiceResponse]:
    return PaymentService(db).list_invoices(current_user)


@router.post("/invoices", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(payload: InvoiceCreate, current_user: FinanceUser, db: DbSession) -> InvoiceResponse:
    return PaymentService(db).create_invoice(payload, current_user)


@router.post("/payments/upi/submit", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def submit_upi_payment(
    request: Request,
    payload: UpiSubmitRequest,
    current_user: TenantUser,
    db: DbSession,
) -> PaymentResponse:
    return PaymentService(db).submit_upi_payment(payload, current_user)


@router.patch("/payments/{payment_id}/verify", response_model=PaymentResponse)
def verify_payment(
    payment_id: int,
    payload: PaymentVerifyRequest,
    current_user: OwnerManagerUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
) -> PaymentResponse:
    return PaymentService(db).verify_payment(payment_id, payload, current_user, background_tasks)


@router.get("/payments", response_model=list[PaymentResponse])
def list_payments(
    current_user: AnyUser,
    db: DbSession,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> list[PaymentResponse]:
    return PaymentService(db).list_payments(current_user, status_filter)


@router.get("/ledger", response_model=list[LedgerEntryResponse])
def list_ledger(tenancy_id: int, current_user: AnyUser, db: DbSession) -> list[LedgerEntryResponse]:
    return PaymentService(db).list_ledger(tenancy_id, current_user)


@router.get("/expenses", response_model=list[ExpenseResponse])
def list_expenses(
    current_user: FinanceUser,
    db: DbSession,
    property_id: int | None = None,
) -> list[ExpenseResponse]:
    return PaymentService(db).list_expenses(current_user, property_id)


@router.post("/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_expense(payload: ExpenseCreate, current_user: FinanceUser, db: DbSession) -> ExpenseResponse:
    return PaymentService(db).create_expense(payload, current_user)

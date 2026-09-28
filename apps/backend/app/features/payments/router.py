from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.property_payments import get_configured_upi_for_property
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.features.auth.dependencies import require_roles
from app.features.auth.models import User
from app.features.payments.models import Invoice
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


def _to_invoice_response(inv: Invoice, db: Session | None = None) -> InvoiceResponse:
    res = InvoiceResponse.model_validate(inv)
    prop = None
    try:
        if inv.tenancy and inv.tenancy.unit and inv.tenancy.unit.property:
            prop = inv.tenancy.unit.property
    except Exception:
        prop = None

    if prop is None and db is not None:
        try:
            from app.features.properties.models import Property, Unit
            from app.features.tenants.models import Tenancy

            stmt = (
                select(Property)
                .join(Unit, Unit.property_id == Property.id)
                .join(Tenancy, Tenancy.unit_id == Unit.id)
                .where(Tenancy.id == inv.tenancy_id)
            )
            prop = db.scalar(stmt)
        except Exception:
            prop = None

    if prop is not None:
        res.payment_upi_id = (
            prop.payment_upi_id.strip()
            if prop.payment_upi_id and prop.payment_upi_id.strip()
            else get_configured_upi_for_property(
                property_name=prop.name,
                property_id=prop.id,
                db_upi_id=prop.payment_upi_id,
            )
        )
        res.property_name = prop.name
    elif not res.payment_upi_id:
        res.payment_upi_id = get_configured_upi_for_property()
    return res



@router.get("/invoices", response_model=list[InvoiceResponse])
def list_invoices(current_user: AnyUser, db: DbSession) -> list[InvoiceResponse]:
    invoices = PaymentService(db).list_invoices(current_user)
    return [_to_invoice_response(inv, db) for inv in invoices]


@router.post("/invoices", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(payload: InvoiceCreate, current_user: FinanceUser, db: DbSession) -> InvoiceResponse:
    inv = PaymentService(db).create_invoice(payload, current_user)
    return _to_invoice_response(inv, db)


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: int, current_user: AnyUser, db: DbSession) -> InvoiceResponse:
    inv = PaymentService(db).get_invoice(invoice_id, current_user)
    return _to_invoice_response(inv, db)


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

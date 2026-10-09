from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
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
    SmartCollectBackfillResponse,
    SmartCollectWebhookResponse,
    UpiSubmitRequest,
)
from app.features.payments.service import PaymentService
from app.features.payments.smart_collect import backfill_virtual_accounts, process_smart_collect_webhook

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

    # Smart Collect Virtual Account details
    tenancy = getattr(inv, "tenancy", None)
    if tenancy is None and db is not None:
        try:
            from app.features.tenants.models import Tenancy

            tenancy = db.scalar(select(Tenancy).where(Tenancy.id == inv.tenancy_id))
        except Exception:
            tenancy = None

    if tenancy is not None:
        if not tenancy.virtual_account_number and db is not None:
            try:
                from app.features.payments.smart_collect import assign_virtual_account_to_tenancy

                assign_virtual_account_to_tenancy(db, tenancy)
                db.commit()
                db.refresh(tenancy)
            except Exception:
                pass
        res.virtual_account_number = tenancy.virtual_account_number
        res.virtual_ifsc = tenancy.virtual_ifsc
        res.virtual_vpa = tenancy.virtual_vpa
        res.bank_provider = tenancy.bank_provider
        tenant = getattr(tenancy, "tenant", None)
        if tenant is None and tenancy.tenant_id and db is not None:
            try:
                from app.features.tenants.models import Tenant

                tenant = db.get(Tenant, tenancy.tenant_id)
            except Exception:
                tenant = None
        tenant_name = tenant.name if tenant else None
        res.virtual_account_name = f"KaramStay - {tenant_name}" if tenant_name else "KaramStay"

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


@router.post(
    "/payments/webhook/smart-collect",
    response_model=SmartCollectWebhookResponse,
    status_code=status.HTTP_200_OK,
)
async def smart_collect_webhook(
    request: Request,
    db: DbSession,
    background_tasks: BackgroundTasks,
) -> SmartCollectWebhookResponse:
    raw_body = await request.body()
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload in webhook body",
        ) from None

    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else None

    result = process_smart_collect_webhook(
        db=db,
        payload=payload,
        raw_body=raw_body,
        headers=request.headers,
        client_ip=client_ip,
        background_tasks=background_tasks,
    )
    return SmartCollectWebhookResponse(**result)


@router.post(
    "/payments/smart-collect/backfill",
    response_model=SmartCollectBackfillResponse,
    status_code=status.HTTP_200_OK,
)
def backfill_smart_collect(
    current_user: FinanceUser,
    db: DbSession,
) -> SmartCollectBackfillResponse:
    count = backfill_virtual_accounts(db)
    return SmartCollectBackfillResponse(status="success", backfilled_count=count)


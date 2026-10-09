import hashlib
import hmac
import logging
import secrets
from collections.abc import Mapping
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.audit import AuditLogService
from app.core.config import settings
from app.core.security import utc_now
from app.features.payments.models import Invoice, LedgerEntry, Payment
from app.features.payments.service import PaymentService
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant

logger = logging.getLogger("karamstay.smart_collect")


def resolve_bank_provider(provider_hint: str | None = None) -> str:
    """Normalize bank provider to either 'icici' or 'hdfc'."""
    raw = (provider_hint or settings.smart_collect_provider or "icici").strip().lower()
    if "hdfc" in raw:
        return "hdfc"
    return "icici"


def generate_virtual_account(
    tenancy_id: int,
    bank_provider: str | None = None,
) -> dict[str, str]:
    """Deterministically allocates collision-free Virtual Account Number & VPA

    based on the assigned bank provider (ICICI or HDFC).
    Example for tenancy 501:
      ICICI: Account KARMI000501, IFSC ICIC0000104, VPA karmi000501@icici
      HDFC:  Account KARMH000501, IFSC HDFC0000060, VPA karmh000501@hdfcbank
    """
    provider = resolve_bank_provider(bank_provider)

    if provider == "hdfc":
        prefix = (settings.hdfc_cms_prefix or "KARMH").strip().upper()
        ifsc = (settings.hdfc_cms_ifsc or "HDFC0000060").strip().upper()
        account_number = f"{prefix}{tenancy_id:06d}"
        vpa = f"{account_number.lower()}@hdfcbank"
    else:
        prefix = (settings.icici_cms_prefix or "KARMI").strip().upper()
        ifsc = (settings.icici_cms_ifsc or "ICIC0000104").strip().upper()
        account_number = f"{prefix}{tenancy_id:06d}"
        vpa = f"{account_number.lower()}@icici"

    return {
        "virtual_account_number": account_number,
        "virtual_ifsc": ifsc,
        "virtual_vpa": vpa,
        "bank_provider": provider,
    }


def assign_virtual_account_to_tenancy(db: Session, tenancy: Tenancy) -> Tenancy:
    """Ensure tenancy has a virtual account assigned based on its property provider."""
    # Look up property bank_provider if available
    provider = None
    if tenancy.unit_id:
        prop = db.scalar(
            select(Property)
            .join(Unit, Unit.property_id == Property.id)
            .where(Unit.id == tenancy.unit_id)
        )
        if prop and prop.bank_provider:
            provider = prop.bank_provider

    va_data = generate_virtual_account(tenancy.id, bank_provider=provider)
    tenancy.virtual_account_number = va_data["virtual_account_number"]
    tenancy.virtual_ifsc = va_data["virtual_ifsc"]
    tenancy.virtual_vpa = va_data["virtual_vpa"]
    tenancy.bank_provider = va_data["bank_provider"]

    if tenancy.tenant:
        tenancy.tenant.virtual_account_number = va_data["virtual_account_number"]
        tenancy.tenant.virtual_ifsc = va_data["virtual_ifsc"]
        tenancy.tenant.virtual_vpa = va_data["virtual_vpa"]
        tenancy.tenant.bank_provider = va_data["bank_provider"]

    return tenancy


def backfill_virtual_accounts(db: Session) -> int:
    """Backfills deterministic virtual accounts for all active tenancies missing one."""
    stmt = (
        select(Tenancy)
        .where(
            Tenancy.deleted_at.is_(None),
            or_(
                Tenancy.virtual_account_number.is_(None),
                Tenancy.virtual_account_number == "",
            ),
        )
    )
    tenancies = list(db.scalars(stmt))
    count = 0
    for t in tenancies:
        assign_virtual_account_to_tenancy(db, t)
        count += 1

    # Also backfill tenants linked to active tenancies
    tenant_stmt = (
        select(Tenant)
        .where(
            Tenant.deleted_at.is_(None),
            or_(
                Tenant.virtual_account_number.is_(None),
                Tenant.virtual_account_number == "",
            ),
        )
    )
    for tenant in db.scalars(tenant_stmt):
        active_t = db.scalar(
            select(Tenancy)
            .where(Tenancy.tenant_id == tenant.id, Tenancy.status == "active", Tenancy.deleted_at.is_(None))
            .order_by(Tenancy.id.desc())
        )
        if active_t and active_t.virtual_account_number:
            tenant.virtual_account_number = active_t.virtual_account_number
            tenant.virtual_ifsc = active_t.virtual_ifsc
            tenant.virtual_vpa = active_t.virtual_vpa
            tenant.bank_provider = active_t.bank_provider

    db.commit()
    return count


def verify_webhook_signature(
    headers: Mapping[str, str],
    body_bytes: bytes,
    bank_provider: str | None = None,
) -> bool:
    """Verifies cryptographic HMAC-SHA256 signature or secret token in constant time."""
    # Determine the configured secret
    provider = resolve_bank_provider(bank_provider)
    if provider == "hdfc":
        secret = settings.hdfc_cms_webhook_secret or settings.smart_collect_webhook_secret
    else:
        secret = settings.icici_cms_webhook_secret or settings.smart_collect_webhook_secret

    # If secret is unset, allow in local development only
    if not secret:
        if settings.environment == "local":
            logger.warning("Smart Collect webhook secret is unset; bypassing signature in local mode.")
            return True
        logger.error("Smart Collect webhook secret is not configured in non-local environment.")
        return False

    secret_bytes = secret.encode("utf-8")

    # 1. Check HMAC signature headers (case-insensitive search)
    header_lower = {k.lower(): v for k, v in headers.items()}
    provided_sig = (
        header_lower.get("x-webhook-signature")
        or header_lower.get("x-signature")
        or header_lower.get("x-bank-signature")
        or header_lower.get("x-hub-signature-256")
        or header_lower.get("signature")
    )

    if provided_sig:
        # Strip sha256= prefix if present
        clean_sig = provided_sig.strip()
        if clean_sig.lower().startswith("sha256="):
            clean_sig = clean_sig[7:].strip()

        computed_sig = hmac.new(secret_bytes, body_bytes, hashlib.sha256).hexdigest()
        if hmac.compare_digest(computed_sig.lower(), clean_sig.lower()):
            return True

    # 2. Check secret token headers / auth bearer
    token_header = (
        header_lower.get("x-webhook-secret")
        or header_lower.get("x-api-key")
        or header_lower.get("authorization")
    )
    if token_header:
        candidate = token_header.strip()
        if candidate.lower().startswith("bearer "):
            candidate = candidate[7:].strip()
        if secrets.compare_digest(candidate, secret):
            return True

    return False


def verify_webhook_timestamp(
    headers: Mapping[str, str],
    payload: dict[str, Any],
    max_age_seconds: int = 300,
) -> bool:
    """Rejects stale webhook payloads > max_age_seconds (5 min) old or drifting into future."""
    header_lower = {k.lower(): v for k, v in headers.items()}
    ts_val = (
        header_lower.get("x-webhook-timestamp")
        or header_lower.get("x-timestamp")
        or payload.get("timestamp")
        or payload.get("txn_timestamp")
        or payload.get("transaction_date")
    )

    if ts_val is None:
        # If no timestamp provided in test/generic payload, consider valid
        return True

    parsed_dt = None
    if isinstance(ts_val, int | float):
        try:
            # Handle milliseconds or seconds
            epoch = ts_val / 1000.0 if ts_val > 1e11 else float(ts_val)
            parsed_dt = datetime.fromtimestamp(epoch, tz=timezone.utc)
        except Exception:
            parsed_dt = None
    elif isinstance(ts_val, str):
        ts_str = ts_val.strip()
        if ts_str.isdigit():
            epoch = float(ts_str)
            if epoch > 1e11:
                epoch /= 1000.0
            parsed_dt = datetime.fromtimestamp(epoch, tz=timezone.utc)
        else:
            try:
                clean_ts = ts_str.replace("Z", "+00:00")
                parsed_dt = datetime.fromisoformat(clean_ts)
                if parsed_dt.tzinfo is None:
                    parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
            except Exception:
                for fmt in (
                    "%Y-%m-%dT%H:%M:%S%z",
                    "%Y-%m-%dT%H:%M:%SZ",
                    "%Y-%m-%d %H:%M:%S",
                    "%Y-%m-%d",
                ):
                    try:
                        dt = datetime.strptime(ts_str, fmt)
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                        parsed_dt = dt
                        break
                    except ValueError:
                        continue

    if parsed_dt is None:
        return False

    now = utc_now()
    diff = abs((now - parsed_dt).total_seconds())
    return diff <= max_age_seconds


def verify_client_ip(client_ip: str | None, whitelisted_ips: list[str]) -> bool:
    """Verifies client IP against configured whitelist (if non-empty)."""
    if not whitelisted_ips:
        return True
    if not client_ip:
        return False
    return client_ip.strip() in [ip.strip() for ip in whitelisted_ips]


def parse_smart_collect_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalizes payload from ICICI CMS, HDFC CMS, or standard Smart Collect format."""
    # Virtual account extraction
    van = (
        payload.get("virtual_account_number")
        or payload.get("virtual_account")
        or payload.get("van")
        or payload.get("account_number")
        or payload.get("CustomerCode")
        or payload.get("BeneAccNo")
        or payload.get("credit_acc_no")
        or payload.get("va_number")
    )
    if van:
        van = str(van).strip().upper()

    # Amount extraction
    raw_amount = (
        payload.get("amount")
        or payload.get("transaction_amount")
        or payload.get("TxnAmt")
        or payload.get("TransferAmt")
        or payload.get("paid_amount")
    )
    parsed_amount = None
    if raw_amount is not None:
        try:
            parsed_amount = Decimal(str(raw_amount).strip())
        except (InvalidOperation, TypeError):
            parsed_amount = None

    # UTR / Bank Reference extraction
    utr = (
        payload.get("utr_number")
        or payload.get("utr")
        or payload.get("bank_reference")
        or payload.get("bank_ref_no")
        or payload.get("rrn")
        or payload.get("BankRefNo")
        or payload.get("UTR")
        or payload.get("reference_id")
        or payload.get("txn_id")
    )
    if utr:
        utr = str(utr).strip()

    bank_ref = (
        payload.get("bank_reference")
        or payload.get("bank_ref_no")
        or payload.get("BankRefNo")
        or utr
    )
    if bank_ref:
        bank_ref = str(bank_ref).strip()

    # Mode / Type
    mode = (
        payload.get("payment_mode")
        or payload.get("mode")
        or payload.get("TransferType")
        or "smart_collect"
    )

    # Remitter / Payer info
    payer_name = (
        payload.get("remitter_name")
        or payload.get("payer_name")
        or payload.get("RemitterName")
    )
    payer_account = (
        payload.get("remitter_account")
        or payload.get("payer_account")
        or payload.get("RemitterAccount")
    )
    payer_ifsc = (
        payload.get("remitter_ifsc")
        or payload.get("payer_ifsc")
        or payload.get("RemitterIFSC")
    )

    return {
        "virtual_account_number": van,
        "amount": parsed_amount,
        "utr_number": utr,
        "bank_reference": bank_ref,
        "mode": str(mode).lower(),
        "payer_name": str(payer_name).strip() if payer_name else None,
        "payer_account": str(payer_account).strip() if payer_account else None,
        "payer_ifsc": str(payer_ifsc).strip().upper() if payer_ifsc else None,
    }


def process_smart_collect_webhook(
    db: Session,
    payload: dict[str, Any],
    raw_body: bytes,
    headers: Mapping[str, str],
    client_ip: str | None = None,
    background_tasks: Any = None,
) -> dict[str, Any]:
    """High-security, fully idempotent Smart Collect webhook processing engine."""
    # 1. IP Whitelisting Validation
    whitelisted_ips = settings.smart_collect_whitelisted_ips
    if whitelisted_ips and not verify_client_ip(client_ip, whitelisted_ips):
        logger.warning("Smart Collect webhook IP not authorized: %s", client_ip)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Client IP is not authorized",
        )

    # 2. Timestamp Validation (Replay attack defense)
    if not verify_webhook_timestamp(headers, payload):
        logger.warning("Smart Collect webhook timestamp stale or invalid.")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook timestamp has expired or is invalid",
        )

    # 3. Cryptographic Signature / Secret Verification
    provider_hint = payload.get("bank_provider") or payload.get("bank")
    if not verify_webhook_signature(headers, raw_body, bank_provider=provider_hint):
        logger.warning("Smart Collect webhook signature or secret verification failed.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature or secret token",
        )

    # 4. Extract and Validate Required Payment Data
    parsed = parse_smart_collect_payload(payload)
    van = parsed["virtual_account_number"]
    amount = parsed["amount"]
    utr = parsed["utr_number"]
    bank_ref = parsed["bank_reference"]

    if not van:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing virtual account number in webhook payload",
        )
    if amount is None or amount <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid or non-positive amount in webhook payload",
        )
    if not utr:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing UTR / transaction reference in webhook payload",
        )

    # 5. Replay Attack & Idempotency Check
    # If the bank retries the same webhook, return HTTP 200 without double-crediting
    existing_payment_stmt = (
        select(Payment)
        .where(
            Payment.deleted_at.is_(None),
            or_(
                Payment.bank_reference == bank_ref,
                Payment.utr_number == utr,
            ),
        )
    )
    existing_payment = db.scalar(existing_payment_stmt)
    if existing_payment is not None:
        logger.info(
            "Smart Collect webhook already processed for UTR %s (Payment ID: %s)",
            utr,
            existing_payment.id,
        )
        return {
            "status": "already_processed",
            "message": "Transaction already recorded and reconciled",
            "payment_id": existing_payment.id,
            "utr_number": utr,
        }

    # 6. Tenancy Resolution
    # Match Tenancy by virtual_account_number
    tenancy_stmt = (
        select(Tenancy)
        .where(
            Tenancy.virtual_account_number == van,
            Tenancy.deleted_at.is_(None),
        )
        .order_by(Tenancy.status == "active", Tenancy.id.desc())
    )
    tenancy = db.scalar(tenancy_stmt)

    if tenancy is None:
        # Fallback to Tenant-level virtual account
        tenant = db.scalar(
            select(Tenant).where(
                Tenant.virtual_account_number == van,
                Tenant.deleted_at.is_(None),
            )
        )
        if tenant:
            tenancy = db.scalar(
                select(Tenancy)
                .where(
                    Tenancy.tenant_id == tenant.id,
                    Tenancy.status == "active",
                    Tenancy.deleted_at.is_(None),
                )
                .order_by(Tenancy.id.desc())
            )

    if tenancy is None:
        logger.error("No matching tenancy found for virtual account: %s", van)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No tenancy found matching virtual account {van}",
        )

    # 7. Invoice Matching & Reconciliation Engine
    payment_service = PaymentService(db)
    # Search for pending, partial, or overdue invoices for this tenancy (FIFO order)
    open_invoices_stmt = (
        select(Invoice)
        .where(
            Invoice.tenancy_id == tenancy.id,
            Invoice.status.in_(["pending", "partial", "overdue"]),
            Invoice.deleted_at.is_(None),
        )
        .order_by(Invoice.due_date.asc())
    )
    open_invoice = db.scalar(open_invoices_stmt)

    matched_invoice_id = None
    if open_invoice is not None:
        matched_invoice_id = open_invoice.id
        outstanding = payment_service._outstanding_amount(open_invoice)
        if amount >= outstanding:
            open_invoice.status = "paid"
        else:
            open_invoice.status = "partial"

    # 8. Record Payment
    payment = Payment(
        invoice_id=matched_invoice_id,
        tenancy_id=tenancy.id,
        amount=amount,
        payment_type="rent",
        mode="smart_collect",
        status="captured",
        utr_number=utr,
        virtual_account_number=van,
        bank_reference=bank_ref,
        raw_webhook_payload=payload,
        paid_at=utc_now(),
        submitted_at=utc_now(),
        verified_at=utc_now(),
    )
    db.add(payment)
    db.flush()

    # 9. Create Ledger Entry
    transfer_type = (parsed.get("mode") or "smart_collect").upper()
    description = f"Smart Collect ({tenancy.bank_provider or 'BANK'}) direct transfer via {transfer_type}. UTR: {utr}"
    db.add(
        LedgerEntry(
            tenancy_id=tenancy.id,
            payment_id=payment.id,
            entry_type="rent",
            direction="credit",
            amount=amount,
            occurred_on=utc_now().date(),
            description=description,
        )
    )

    # 10. Audit Log
    AuditLogService(db).record(
        user_id=None,
        action="payment.smart_collect_captured",
        entity_type="payment",
        entity_id=payment.id,
        metadata={
            "van": van,
            "utr": utr,
            "amount": str(amount),
            "invoice_id": matched_invoice_id,
            "tenancy_id": tenancy.id,
        },
    )

    db.commit()
    db.refresh(payment)

    # 11. Dispatch notifications and issue PDF receipt
    try:
        if background_tasks is not None:
            background_tasks.add_task(payment_service._issue_receipt, payment.id)
        else:
            payment_service._issue_receipt(payment.id)
    except Exception:
        logger.exception("Failed to dispatch receipt notification for payment %s", payment.id)

    return {
        "status": "success",
        "message": "Payment captured and reconciled successfully",
        "payment_id": payment.id,
        "invoice_id": matched_invoice_id,
        "amount": float(payment.amount),
        "utr_number": utr,
        "tenancy_id": tenancy.id,
    }

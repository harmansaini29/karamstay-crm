import hashlib
import hmac
import ipaddress
import logging
import secrets
from collections.abc import Mapping
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import AuditLogService
from app.core.bank_accounts import (
    get_all_candidate_webhook_secrets,
    get_bank_account,
    get_default_bank_account,
    get_webhook_secrets_for_account,
    resolve_bank_account_for_van,
)
from app.core.config import settings
from app.core.security import utc_now
from app.features.payments.models import Invoice, LedgerEntry, Payment
from app.features.payments.service import PaymentService
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant

logger = logging.getLogger("karamstay.smart_collect")


def resolve_bank_provider(
    provider_hint: str | None = None,
    van: str | None = None,
) -> str:
    """Normalize bank provider / account key.

    Deduces provider from explicit hint, VAN prefix, or system config.
    Supports multi-account keys: 'hdfc_1', 'hdfc_2', 'nkgsb_1' as well as
    legacy 'hdfc' and 'icici'.
    """
    if van:
        acc = resolve_bank_account_for_van(van)
        if acc:
            return acc.key
        van_upper = van.strip().upper()
        if van_upper.startswith("KARMH1"):
            return "hdfc_1"
        if van_upper.startswith("KARMH2"):
            return "hdfc_2"
        if van_upper.startswith("KARMN1"):
            return "nkgsb_1"
        hdfc_prefix = (settings.hdfc_cms_prefix or "KARMH").strip().upper()
        icici_prefix = (settings.icici_cms_prefix or "KARMI").strip().upper()
        if van_upper.startswith(hdfc_prefix):
            return "hdfc"
        if van_upper.startswith(icici_prefix):
            return "icici"

    if provider_hint:
        hint_lower = provider_hint.strip().lower()
        if hint_lower in ("hdfc_1", "hdfc1", "hdfc-1"):
            return "hdfc_1"
        if hint_lower in ("hdfc_2", "hdfc2", "hdfc-2"):
            return "hdfc_2"
        if "nkgsb" in hint_lower:
            return "nkgsb_1"
        acc = get_bank_account(provider_hint)
        if acc:
            return acc.key
        if "hdfc" in hint_lower:
            return "hdfc"
        if "icici" in hint_lower:
            return "icici"

    if (
        settings.smart_collect_provider
        and settings.smart_collect_provider.strip().lower() not in ("bank_cms", "")
    ):
        provider_setting = settings.smart_collect_provider.strip().lower()
        acc = get_bank_account(provider_setting)
        if acc:
            return acc.key
        if "hdfc" in provider_setting:
            return "hdfc_1"
        if "icici" in provider_setting:
            return "icici"

    # Default to the primary bank account (hdfc_1)
    default_acc = get_default_bank_account()
    return default_acc.key


def generate_virtual_account(
    tenancy_id: int,
    bank_provider: str | None = None,
) -> dict[str, str]:
    """Deterministically allocates collision-free Virtual Account Number & VPA

    based on the assigned bank account (HDFC 1, HDFC 2, NKGSB, or legacy HDFC/ICICI).
    All prefix, IFSC, and UPI templates are derived dynamically from
    app.core.bank_accounts.BANK_ACCOUNTS_REGISTRY as the single authoritative source of truth.
    Example for tenancy 501:
      HDFC 1: Account KARMH1000501, IFSC HDFC0000060, VPA karmh1000501@hdfcbank
      HDFC 2: Account KARMH2000501, IFSC HDFC0000060, VPA karmh2000501@hdfcbank
      NKGSB:  Account KARMN1000501, IFSC NKGS0000001, VPA karmn1000501@nkgsb
    """
    provider = resolve_bank_provider(bank_provider)
    account = get_bank_account(provider) or get_default_bank_account()

    prefix = account.van_prefix.upper()
    ifsc = account.ifsc.upper()
    account_number = f"{prefix}{tenancy_id:06d}"
    vpa = account.upi_handle_template.replace("{van}", account_number.lower())

    return {
        "virtual_account_number": account_number,
        "virtual_ifsc": ifsc,
        "virtual_vpa": vpa,
        "bank_provider": account.key,
        "bank_account_key": account.key,
    }


def assign_virtual_account_to_tenancy(db: Session, tenancy: Tenancy) -> Tenancy:
    """Ensure tenancy has a virtual account assigned based on its property provider."""
    # Look up property bank_account_key / bank_provider if available
    provider = None
    if tenancy.unit_id:
        prop = db.scalar(
            select(Property)
            .join(Unit, Unit.property_id == Property.id)
            .where(Unit.id == tenancy.unit_id)
        )
        if prop:
            provider = prop.bank_account_key or prop.bank_provider

    va_data = generate_virtual_account(tenancy.id, bank_provider=provider)
    tenancy.virtual_account_number = va_data["virtual_account_number"]
    tenancy.virtual_ifsc = va_data["virtual_ifsc"]
    tenancy.virtual_vpa = va_data["virtual_vpa"]
    tenancy.bank_provider = va_data["bank_provider"]

    tenant = tenancy.tenant
    if tenant is None and tenancy.tenant_id:
        try:
            tenant = db.get(Tenant, tenancy.tenant_id)
        except Exception:
            tenant = None

    if tenant:
        tenant.virtual_account_number = va_data["virtual_account_number"]
        tenant.virtual_ifsc = va_data["virtual_ifsc"]
        tenant.virtual_vpa = va_data["virtual_vpa"]
        tenant.bank_provider = va_data["bank_provider"]

    return tenancy


def backfill_virtual_accounts(db: Session) -> int:
    """Backfills deterministic virtual accounts for all active tenancies missing one."""
    if not settings.smart_collect_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Smart Collect is currently disabled",
        )

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
    van: str | None = None,
) -> bool:
    """Verifies cryptographic HMAC-SHA256 signature or secret token in constant time.

    Enforces strict bank account isolation: if the webhook belongs to a resolved
    bank account (from VAN prefix or provider hint), ONLY that bank account's
    secret is accepted. Cross-bank secret forging is rejected.
    """
    account = (
        resolve_bank_account_for_van(van)
        or (get_bank_account(bank_provider) if bank_provider else None)
    )

    if account:
        candidate_secrets: list[str] = get_webhook_secrets_for_account(account)
    else:
        provider = resolve_bank_provider(bank_provider, van=van)
        candidate_secrets = get_all_candidate_webhook_secrets(priority_key=provider)

    # If secret is unset across the board, allow in local development only
    if not candidate_secrets:
        if settings.environment == "local":
            logger.warning("Smart Collect webhook secret is unset; bypassing signature in local mode.")
            return True
        logger.error("Smart Collect webhook secret is not configured in non-local environment.")
        return False

    header_lower = {k.lower(): v for k, v in headers.items()}
    provided_sig = (
        header_lower.get("x-webhook-signature")
        or header_lower.get("x-signature")
        or header_lower.get("x-bank-signature")
        or header_lower.get("x-hub-signature-256")
        or header_lower.get("signature")
    )

    token_header = (
        header_lower.get("x-webhook-secret")
        or header_lower.get("x-api-key")
        or header_lower.get("authorization")
    )

    for secret in candidate_secrets:
        secret_bytes = secret.encode("utf-8")

        # 1. HMAC Signature verification
        if provided_sig:
            clean_sig = provided_sig.strip()
            if clean_sig.lower().startswith("sha256="):
                clean_sig = clean_sig[7:].strip()
            computed_sig = hmac.new(secret_bytes, body_bytes, hashlib.sha256).hexdigest()
            if hmac.compare_digest(computed_sig.lower(), clean_sig.lower()):
                return True

        # 2. Secret token / Bearer verification
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
    """Rejects stale webhook payloads > max_age_seconds (5 min) old or drifting into future.

    Distinguishes real-time request timestamps (used for replay attack mitigation)
    from transaction/accounting value dates.
    """
    header_lower = {k.lower(): v for k, v in headers.items()}
    ts_val = (
        header_lower.get("x-webhook-timestamp")
        or header_lower.get("x-timestamp")
        or payload.get("timestamp")
        or payload.get("txn_timestamp")
        or payload.get("req_timestamp")
        or payload.get("request_time")
        or payload.get("created_at")
    )

    date_only_val = (
        payload.get("transaction_date")
        or payload.get("txn_date")
        or payload.get("value_date")
    )

    # If no real-time timestamp header/field is provided
    if ts_val is None:
        # If only a date-only value exists, ensure it's within +- 30 days
        if date_only_val:
            try:
                date_str = str(date_only_val).strip()
                for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
                    try:
                        d = datetime.strptime(date_str, fmt).date()
                        now_d = utc_now().date()
                        if abs((now_d - d).days) <= 30:
                            return True
                    except ValueError:
                        continue
            except Exception:
                pass
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
                    "%d/%m/%Y %H:%M:%S",
                    "%d-%m-%Y %H:%M:%S",
                    "%Y%m%d%H%M%S",
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
        # Check if ts_val is a date-only string within reasonable tolerance
        if isinstance(ts_val, str):
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
                try:
                    d = datetime.strptime(ts_val.strip(), fmt).date()
                    now_d = utc_now().date()
                    if abs((now_d - d).days) <= 30:
                        return True
                except ValueError:
                    continue
        return False

    now = utc_now()
    diff = abs((now - parsed_dt).total_seconds())
    return diff <= max_age_seconds


def verify_client_ip(client_ip: str | None, whitelisted_ips: list[str]) -> bool:
    """Verifies client IP against configured whitelist supporting single IPs and CIDR subnets."""
    if not whitelisted_ips:
        return True
    if not client_ip:
        return False
    try:
        client_addr = ipaddress.ip_address(client_ip.strip())
    except ValueError:
        return False

    for item in whitelisted_ips:
        item_clean = item.strip()
        if not item_clean:
            continue
        try:
            if "/" in item_clean:
                if client_addr in ipaddress.ip_network(item_clean, strict=False):
                    return True
            else:
                if client_addr == ipaddress.ip_address(item_clean):
                    return True
        except ValueError:
            continue
    return False


def parse_smart_collect_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalizes payload from ICICI CMS, HDFC CMS, or standard Smart Collect format."""
    # Case-insensitive lookup map
    lookup = {k.lower().replace("_", ""): v for k, v in payload.items()}

    def get_first(*keys: str) -> Any:
        for k in keys:
            normalized = k.lower().replace("_", "")
            if normalized in lookup and lookup[normalized] is not None:
                return lookup[normalized]
        return None

    # Virtual account extraction
    van = get_first(
        "virtual_account_number",
        "virtual_account",
        "van",
        "account_number",
        "customercode",
        "beneaccno",
        "credit_acc_no",
        "va_number",
        "virtualaccountnumber",
        "bene_acc_no",
    )
    if van:
        van = str(van).strip().upper()

    # Amount extraction
    raw_amount = get_first(
        "amount",
        "transaction_amount",
        "txnamt",
        "transferamt",
        "paid_amount",
        "transfer_amount",
    )
    parsed_amount = None
    if raw_amount is not None:
        try:
            parsed_amount = Decimal(str(raw_amount).strip())
        except (InvalidOperation, TypeError):
            parsed_amount = None

    # UTR / Bank Reference extraction
    utr = get_first(
        "utr_number",
        "utr",
        "bank_reference",
        "bank_ref_no",
        "rrn",
        "bankrefno",
        "utrno",
        "txn_id",
        "reference_id",
    )
    if utr:
        utr = str(utr).strip()

    bank_ref = (
        get_first(
            "bank_reference",
            "bank_ref_no",
            "bankrefno",
            "rrn",
        )
        or utr
    )
    if bank_ref:
        bank_ref = str(bank_ref).strip()

    # Mode / Type
    mode = (
        get_first(
            "payment_mode",
            "mode",
            "transfertype",
            "transfer_type",
            "txntype",
        )
        or "smart_collect"
    )

    # Remitter / Payer info
    payer_name = get_first("remitter_name", "payer_name", "remittername", "payername")
    payer_account = get_first("remitter_account", "payer_account", "remitteraccount", "remitteraccno")
    payer_ifsc = get_first("remitter_ifsc", "payer_ifsc", "remitterifsc", "remitterbank")

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
    # 0. Global Feature Flag Check
    if not settings.smart_collect_enabled:
        logger.warning("Smart Collect webhook received but feature is disabled in configuration.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Smart Collect is currently disabled",
        )

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

    # 3. Extract and Validate Required Payment Data
    parsed = parse_smart_collect_payload(payload)
    van = parsed["virtual_account_number"]
    amount = parsed["amount"]
    utr = parsed["utr_number"]
    bank_ref = parsed["bank_reference"]

    # Bank Account Resolution & Service Kill-Switch Check
    provider_hint = (
        payload.get("bank_account_key")
        or payload.get("bank_provider")
        or payload.get("bank")
    )
    account = resolve_bank_account_for_van(van) or (
        get_bank_account(provider_hint) if provider_hint else None
    )
    if account and not account.is_active:
        bank_label = account.name or account.bank_name
        logger.warning(
            "Smart Collect webhook rejected: service paused for bank account '%s' (%s).",
            account.key,
            bank_label,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Bank account collection service is paused for {bank_label}",
        )

    # 4. Cryptographic Signature / Secret Verification
    if not verify_webhook_signature(headers, raw_body, bank_provider=provider_hint, van=van):
        logger.warning("Smart Collect webhook signature or secret verification failed.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature or secret token",
        )

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
            "invoice_id": existing_payment.invoice_id,
            "amount": float(existing_payment.amount),
            "utr_number": utr,
            "tenancy_id": existing_payment.tenancy_id,
            "payment_ids": [existing_payment.id],
            "settled_invoice_ids": [existing_payment.invoice_id] if existing_payment.invoice_id else [],
        }

    # 6. Tenancy Resolution
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

    # 7. Invoice Matching & Multi-Invoice Reconciliation Engine (FIFO)
    payment_service = PaymentService(db)
    open_invoices_stmt = (
        select(Invoice)
        .where(
            Invoice.tenancy_id == tenancy.id,
            Invoice.status.in_(["pending", "partial", "overdue"]),
            Invoice.deleted_at.is_(None),
        )
        .order_by(Invoice.due_date.asc(), Invoice.id.asc())
    )
    open_invoices = list(db.scalars(open_invoices_stmt))

    remaining_amount = amount
    settled_invoices: list[Invoice] = []
    created_payments: list[Payment] = []

    for inv in open_invoices:
        if remaining_amount <= Decimal("0.00"):
            break
        outstanding = payment_service._outstanding_amount(inv)
        if outstanding <= Decimal("0.00"):
            inv.status = "paid"
            continue

        alloc = min(remaining_amount, outstanding)
        pay = Payment(
            invoice_id=inv.id,
            tenancy_id=tenancy.id,
            amount=alloc,
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
        db.add(pay)
        db.flush()
        created_payments.append(pay)

        new_outstanding = outstanding - alloc
        inv.status = "paid" if new_outstanding <= Decimal("0.00") else "partial"
        settled_invoices.append(inv)
        remaining_amount -= alloc

    # 8. Unapplied advance credit if remaining amount > 0 or no open invoices existed
    if remaining_amount > Decimal("0.00") or not created_payments:
        advance_payment = Payment(
            invoice_id=None,
            tenancy_id=tenancy.id,
            amount=remaining_amount if created_payments else amount,
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
        db.add(advance_payment)
        db.flush()
        created_payments.append(advance_payment)

    # 9. Create Ledger Entries
    transfer_type = (parsed.get("mode") or "smart_collect").upper()
    for pay in created_payments:
        inv_desc = f" for Invoice #{pay.invoice_id}" if pay.invoice_id else " (Unapplied Advance Credit)"
        bank_label = tenancy.bank_provider or "BANK"
        description = (
            f"Smart Collect ({bank_label}) direct transfer via {transfer_type}{inv_desc}. UTR: {utr}"
        )
        db.add(
            LedgerEntry(
                tenancy_id=tenancy.id,
                payment_id=pay.id,
                entry_type="rent",
                direction="credit",
                amount=pay.amount,
                occurred_on=utc_now().date(),
                description=description,
            )
        )

    # 10. Audit Log
    AuditLogService(db).record(
        user_id=None,
        action="payment.smart_collect_captured",
        entity_type="payment",
        entity_id=created_payments[0].id,
        metadata={
            "van": van,
            "utr": utr,
            "total_amount": str(amount),
            "payment_ids": [p.id for p in created_payments],
            "invoice_ids": [i.id for i in settled_invoices],
            "tenancy_id": tenancy.id,
        },
    )

    # Concurrency safe commit
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(existing_payment_stmt)
        if existing is not None:
            return {
                "status": "already_processed",
                "message": "Transaction already recorded and reconciled",
                "payment_id": existing.id,
                "invoice_id": existing.invoice_id,
                "amount": float(existing.amount),
                "utr_number": utr,
                "tenancy_id": existing.tenancy_id,
                "payment_ids": [existing.id],
                "settled_invoice_ids": [existing.invoice_id] if existing.invoice_id else [],
            }
        raise

    for pay in created_payments:
        db.refresh(pay)

    # 11. Dispatch notifications and issue receipts
    for pay in created_payments:
        try:
            if background_tasks is not None:
                background_tasks.add_task(payment_service._issue_receipt, pay.id)
            else:
                payment_service._issue_receipt(pay.id)
        except Exception:
            logger.exception("Failed to dispatch receipt notification for payment %s", pay.id)

    primary_payment = created_payments[0]
    primary_invoice_id = settled_invoices[0].id if settled_invoices else None

    return {
        "status": "success",
        "message": "Payment captured and reconciled successfully",
        "payment_id": primary_payment.id,
        "invoice_id": primary_invoice_id,
        "amount": float(amount),
        "utr_number": utr,
        "tenancy_id": tenancy.id,
        "payment_ids": [p.id for p in created_payments],
        "settled_invoice_ids": [i.id for i in settled_invoices],
    }

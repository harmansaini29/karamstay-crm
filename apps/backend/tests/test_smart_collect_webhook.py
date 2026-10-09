import hashlib
import hmac
import json
from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.core.config import settings
from app.core.security import utc_now
from app.features.payments.models import Invoice, LedgerEntry, Payment
from app.features.payments.smart_collect import (
    backfill_virtual_accounts,
    generate_virtual_account,
)
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user


def _seed_tenancy_with_van(
    db_session,
    owner_id: int,
    bank_provider: str = "icici",
    van: str | None = None,
) -> Tenancy:
    property_ = Property(
        owner_id=owner_id,
        name="Karam Residency",
        address="10 Civil Lines, Jaipur",
        property_type="PG",
        bank_provider=bank_provider,
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(property_)
    db_session.flush()

    unit = Unit(
        property_id=property_.id,
        unit_no="202",
        unit_type="room",
        rent=8500,
        deposit=8500,
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(name="Aman Sharma", phone="+919876543210")
    db_session.add(tenant)
    db_session.flush()

    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=unit.id,
        start_date=date(2026, 7, 1),
        monthly_rent=Decimal("8500.00"),
        security_deposit=Decimal("8500.00"),
        status="active",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(tenancy)
    db_session.flush()

    # Allocate VAN
    va = generate_virtual_account(tenancy.id, bank_provider=bank_provider)
    tenancy.virtual_account_number = van or va["virtual_account_number"]
    tenancy.virtual_ifsc = va["virtual_ifsc"]
    tenancy.virtual_vpa = va["virtual_vpa"]
    tenancy.bank_provider = va["bank_provider"]

    tenant.virtual_account_number = tenancy.virtual_account_number
    tenant.virtual_ifsc = tenancy.virtual_ifsc
    tenant.virtual_vpa = tenancy.virtual_vpa
    tenant.bank_provider = tenancy.bank_provider

    db_session.commit()
    db_session.refresh(tenancy)
    return tenancy


def _seed_invoice(db_session, tenancy: Tenancy, amount: str = "8500.00") -> Invoice:
    invoice = Invoice(
        tenancy_id=tenancy.id,
        billing_period="2026-07",
        due_date=date(2026, 7, 5),
        amount=Decimal(amount),
        status="pending",
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)
    return invoice


def _generate_hmac_header(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


# --- Unit Tests: Deterministic VAN Generation & Backfill ---


def test_generate_virtual_account_icici_and_hdfc():
    icici_va = generate_virtual_account(501, bank_provider="icici")
    assert icici_va["virtual_account_number"] == f"{settings.icici_cms_prefix}000501"
    assert icici_va["virtual_ifsc"] == settings.icici_cms_ifsc
    assert icici_va["virtual_vpa"] == f"{icici_va['virtual_account_number'].lower()}@icici"
    assert icici_va["bank_provider"] == "icici"

    hdfc_va = generate_virtual_account(501, bank_provider="hdfc")
    assert hdfc_va["virtual_account_number"] == f"{settings.hdfc_cms_prefix}000501"
    assert hdfc_va["virtual_ifsc"] == settings.hdfc_cms_ifsc
    assert hdfc_va["virtual_vpa"] == f"{hdfc_va['virtual_account_number'].lower()}@hdfcbank"
    assert hdfc_va["bank_provider"] == "hdfc"


def test_backfill_virtual_accounts(db_session):
    owner = create_user(db_session, role_name="owner", email="owner_bf@example.com")
    # Create tenancy with empty virtual account
    property_ = Property(
        owner_id=owner.id,
        name="Karam Residency",
        address="Jaipur",
        property_type="PG",
        bank_provider="icici",
    )
    db_session.add(property_)
    db_session.flush()

    unit = Unit(property_id=property_.id, unit_no="B1", unit_type="room", rent=5000, deposit=5000)
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(name="Backfill Tenant", phone="+919999900001")
    db_session.add(tenant)
    db_session.flush()

    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=unit.id,
        start_date=date(2026, 7, 1),
        monthly_rent=Decimal("5000.00"),
        security_deposit=Decimal("5000.00"),
        status="active",
        virtual_account_number=None,
    )
    db_session.add(tenancy)
    db_session.commit()

    count = backfill_virtual_accounts(db_session)
    assert count >= 1
    db_session.refresh(tenancy)
    assert tenancy.virtual_account_number is not None
    assert tenancy.virtual_account_number.startswith(settings.icici_cms_prefix)
    assert tenancy.virtual_vpa is not None


# --- Webhook Tests: Success, Signatures, Idempotency, Edge Cases ---


def test_webhook_smart_collect_success_icici_hmac(client, db_session, monkeypatch):
    secret = "icici_super_secure_webhook_key_32bytes!"
    monkeypatch.setattr(settings, "icici_cms_webhook_secret", secret)
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    owner = create_user(db_session, role_name="owner", email="owner_wh1@example.com")
    tenancy = _seed_tenancy_with_van(db_session, owner.id, bank_provider="icici")
    invoice = _seed_invoice(db_session, tenancy, amount="8500.00")

    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "8500.00",
        "utr_number": "UTR20261010001",
        "bank_reference": "ICICI_REF_001",
        "payment_mode": "IMPS",
        "payer_name": "Aman Sharma",
        "timestamp": utc_now().isoformat(),
        "bank_provider": "icici",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, secret)

    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": sig,
            "X-Webhook-Timestamp": str(int(utc_now().timestamp())),
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["invoice_id"] == invoice.id
    assert data["amount"] == 8500.0

    # Verify Invoice status is now PAID
    db_session.refresh(invoice)
    assert invoice.status == "paid"

    # Verify Payment recorded
    payment = db_session.get(Payment, data["payment_id"])
    assert payment is not None
    assert payment.mode == "smart_collect"
    assert payment.status == "captured"
    assert payment.utr_number == "UTR20261010001"
    assert payment.virtual_account_number == tenancy.virtual_account_number

    # Verify Ledger credited
    ledger_entry = db_session.scalar(
        select(LedgerEntry).where(LedgerEntry.payment_id == payment.id)
    )
    assert ledger_entry is not None
    assert ledger_entry.direction == "credit"
    assert ledger_entry.amount == Decimal("8500.00")


def test_webhook_smart_collect_hdfc_token_auth(client, db_session, monkeypatch):
    secret = "hdfc_cms_secret_token_1234567890"
    monkeypatch.setattr(settings, "hdfc_cms_webhook_secret", secret)
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    owner = create_user(db_session, role_name="owner", email="owner_wh2@example.com")
    tenancy = _seed_tenancy_with_van(db_session, owner.id, bank_provider="hdfc")
    invoice = _seed_invoice(db_session, tenancy, amount="9000.00")

    # HDFC CMS field names payload
    payload = {
        "BeneAccNo": tenancy.virtual_account_number,
        "TxnAmt": "9000.00",
        "BankRefNo": "HDFC_REF_9999",
        "TransferType": "NEFT",
        "RemitterName": "Aman Sharma",
        "timestamp": utc_now().isoformat(),
        "bank_provider": "hdfc",
    }
    body = json.dumps(payload).encode("utf-8")

    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Secret": secret,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"

    db_session.refresh(invoice)
    assert invoice.status == "paid"


def test_webhook_smart_collect_partial_payment(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "fallback_secret")
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    owner = create_user(db_session, role_name="owner", email="owner_wh3@example.com")
    tenancy = _seed_tenancy_with_van(db_session, owner.id)
    invoice = _seed_invoice(db_session, tenancy, amount="10000.00")

    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "4000.00",
        "utr_number": "UTR_PARTIAL_001",
        "payment_mode": "UPI",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, "fallback_secret")

    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": sig,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"

    db_session.refresh(invoice)
    assert invoice.status == "partial"


def test_webhook_smart_collect_replay_attack_idempotency(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "secret_idempotent")
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    owner = create_user(db_session, role_name="owner", email="owner_wh4@example.com")
    tenancy = _seed_tenancy_with_van(db_session, owner.id)
    _seed_invoice(db_session, tenancy, amount="7000.00")

    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "7000.00",
        "utr_number": "UTR_DUPLICATE_TEST",
        "bank_reference": "REF_DUP_001",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, "secret_idempotent")
    headers = {"Content-Type": "application/json", "X-Webhook-Signature": sig}

    # 1. First invocation -> captured
    res1 = client.post("/api/v1/payments/webhook/smart-collect", data=body, headers=headers)
    assert res1.status_code == 200
    assert res1.json()["status"] == "success"
    payment_id = res1.json()["payment_id"]

    # Count ledger entries
    ledger_count_1 = len(
        list(db_session.scalars(select(LedgerEntry).where(LedgerEntry.tenancy_id == tenancy.id)))
    )

    # 2. Second invocation with identical UTR (Bank retry) -> idempotent already_processed
    res2 = client.post("/api/v1/payments/webhook/smart-collect", data=body, headers=headers)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["status"] == "already_processed"
    assert data2["payment_id"] == payment_id

    # Ledger entries must not be duplicated
    ledger_count_2 = len(
        list(db_session.scalars(select(LedgerEntry).where(LedgerEntry.tenancy_id == tenancy.id)))
    )
    assert ledger_count_2 == ledger_count_1


def test_webhook_smart_collect_invalid_signature_rejected(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "correct_secret")
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    payload = {
        "virtual_account_number": "KARMI000999",
        "amount": "1000.00",
        "utr_number": "UTR_SIG_FAIL",
    }
    body = json.dumps(payload).encode("utf-8")

    # Wrong signature
    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": "wrong_signature_hex",
        },
    )
    assert response.status_code == 401
    err_msg = response.json().get("message") or response.json().get("detail", "")
    assert "Invalid webhook signature" in err_msg


def test_webhook_smart_collect_stale_timestamp_rejected(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "ts_secret")
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    payload = {
        "virtual_account_number": "KARMI000999",
        "amount": "1000.00",
        "utr_number": "UTR_TS_FAIL",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, "ts_secret")

    # Stale timestamp: 10 minutes ago (> 300 seconds)
    stale_timestamp = str(int(utc_now().timestamp()) - 600)

    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": sig,
            "X-Webhook-Timestamp": stale_timestamp,
        },
    )
    assert response.status_code == 400
    err_msg = response.json().get("message") or response.json().get("detail", "")
    assert "expired" in err_msg.lower()


def test_webhook_smart_collect_unknown_virtual_account(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "secret_unknown")
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    payload = {
        "virtual_account_number": "NONEXISTENT_VAN_99999",
        "amount": "5000.00",
        "utr_number": "UTR_UNKNOWN_ACC",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, "secret_unknown")

    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": sig,
        },
    )
    assert response.status_code == 404
    err_msg = response.json().get("message") or response.json().get("detail", "")
    assert "No tenancy found" in err_msg



def test_webhook_smart_collect_ip_whitelist(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "secret_ip")
    # Set whitelist to only allow bank gateway IP 192.168.1.100
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", ["192.168.1.100"])

    payload = {
        "virtual_account_number": "KARMI000999",
        "amount": "5000.00",
        "utr_number": "UTR_IP_TEST",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, "secret_ip")

    # Unauthorized IP
    res_forbidden = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": sig,
            "X-Forwarded-For": "10.0.0.1",
        },
    )
    assert res_forbidden.status_code == 403

    # Authorized IP (will proceed past IP check to account lookup)
    res_authorized = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": sig,
            "X-Forwarded-For": "192.168.1.100",
        },
    )
    # Not 403; reached account lookup (which yields 404 for nonexistent van)
    assert res_authorized.status_code == 404


def test_backfill_api_endpoint(client, db_session):
    create_user(db_session, role_name="owner", email="owner_bf_api@example.com")
    headers = auth_headers(client, email="owner_bf_api@example.com")

    response = client.post("/api/v1/payments/smart-collect/backfill", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert "backfilled_count" in response.json()


def test_webhook_smart_collect_advance_payment_without_pending_invoice(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "secret_advance")
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    owner = create_user(db_session, role_name="owner", email="owner_adv@example.com")
    tenancy = _seed_tenancy_with_van(db_session, owner.id)
    # Tenancy exists, but NO pending invoice exists

    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "12000.00",
        "utr_number": "UTR_ADVANCE_001",
        "payment_mode": "RTGS",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, "secret_advance")

    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": sig,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["invoice_id"] is None
    assert data["amount"] == 12000.0

    # Verify payment recorded and ledger credited
    payment = db_session.get(Payment, data["payment_id"])
    assert payment is not None
    assert payment.invoice_id is None
    assert payment.tenancy_id == tenancy.id
    assert payment.mode == "smart_collect"

    ledger_entry = db_session.scalar(
        select(LedgerEntry).where(LedgerEntry.payment_id == payment.id)
    )
    assert ledger_entry is not None
    assert ledger_entry.direction == "credit"
    assert ledger_entry.amount == Decimal("12000.00")



def test_webhook_smart_collect_multi_invoice_fifo_settlement(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "secret_multi")
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    owner = create_user(db_session, role_name="owner", email="owner_multi1@example.com")
    tenancy = _seed_tenancy_with_van(db_session, owner.id)
    inv1 = Invoice(
        tenancy_id=tenancy.id,
        billing_period="2026-06",
        due_date=date(2026, 6, 5),
        amount=Decimal("5000.00"),
        status="pending",
    )
    inv2 = Invoice(
        tenancy_id=tenancy.id,
        billing_period="2026-07",
        due_date=date(2026, 7, 5),
        amount=Decimal("5000.00"),
        status="pending",
    )
    db_session.add_all([inv1, inv2])
    db_session.commit()

    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "10000.00",
        "utr_number": "UTR_MULTI_SETTLE_001",
        "payment_mode": "IMPS",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, "secret_multi")

    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={"Content-Type": "application/json", "X-Webhook-Signature": sig},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert inv1.id in data["settled_invoice_ids"]
    assert inv2.id in data["settled_invoice_ids"]

    db_session.refresh(inv1)
    db_session.refresh(inv2)
    assert inv1.status == "paid"
    assert inv2.status == "paid"


def test_webhook_smart_collect_multi_invoice_partial_and_split(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "secret_split")
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    owner = create_user(db_session, role_name="owner", email="owner_split@example.com")
    tenancy = _seed_tenancy_with_van(db_session, owner.id)
    inv1 = Invoice(
        tenancy_id=tenancy.id,
        billing_period="2026-06",
        due_date=date(2026, 6, 5),
        amount=Decimal("5000.00"),
        status="pending",
    )
    inv2 = Invoice(
        tenancy_id=tenancy.id,
        billing_period="2026-07",
        due_date=date(2026, 7, 5),
        amount=Decimal("5000.00"),
        status="pending",
    )
    db_session.add_all([inv1, inv2])
    db_session.commit()

    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "8000.00",
        "utr_number": "UTR_SPLIT_001",
        "payment_mode": "NEFT",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, "secret_split")

    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={"Content-Type": "application/json", "X-Webhook-Signature": sig},
    )
    assert response.status_code == 200

    db_session.refresh(inv1)
    db_session.refresh(inv2)
    assert inv1.status == "paid"
    assert inv2.status == "partial"


def test_webhook_smart_collect_disabled_feature_flag(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_enabled", False)
    payload = {
        "virtual_account_number": "KARMI000123",
        "amount": "5000.00",
        "utr_number": "UTR_FLAG_OFF",
    }
    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        json=payload,
    )
    assert response.status_code == 503
    err_msg = response.json().get("message") or response.json().get("detail", "")
    assert "disabled" in err_msg.lower()


def test_webhook_smart_collect_backfill_disabled_feature_flag(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_enabled", False)
    create_user(db_session, role_name="owner", email="owner_bf_off@example.com")
    headers = auth_headers(client, email="owner_bf_off@example.com")

    response = client.post("/api/v1/payments/smart-collect/backfill", headers=headers)
    assert response.status_code == 503
    err_msg = response.json().get("message") or response.json().get("detail", "")
    assert "disabled" in err_msg.lower()


def test_webhook_smart_collect_hdfc_signature_without_bank_provider_in_payload(client, db_session, monkeypatch):
    hdfc_secret = "hdfc_cms_bank_secret_998877"
    monkeypatch.setattr(settings, "hdfc_cms_webhook_secret", hdfc_secret)
    monkeypatch.setattr(settings, "icici_cms_webhook_secret", "icici_different_secret")
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", None)
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    owner = create_user(db_session, role_name="owner", email="owner_hdfc_noprov@example.com")
    tenancy = _seed_tenancy_with_van(db_session, owner.id, bank_provider="hdfc")
    _seed_invoice(db_session, tenancy, amount="6500.00")

    payload = {
        "BeneAccNo": tenancy.virtual_account_number,
        "TxnAmt": "6500.00",
        "BankRefNo": "HDFC_CMS_REF_AUTO",
        "TransferType": "RTGS",
        "RemitterName": "Tenant Testing",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, hdfc_secret)

    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={"Content-Type": "application/json", "X-Webhook-Signature": sig},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_webhook_smart_collect_date_only_transaction_date_accepted(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "date_secret")
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    owner = create_user(db_session, role_name="owner", email="owner_date_test@example.com")
    tenancy = _seed_tenancy_with_van(db_session, owner.id)
    _seed_invoice(db_session, tenancy, amount="5000.00")

    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "5000.00",
        "utr_number": "UTR_DATE_ONLY_001",
        "transaction_date": str(utc_now().date()),
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, "date_secret")

    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={"Content-Type": "application/json", "X-Webhook-Signature": sig},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_webhook_smart_collect_indian_timestamp_format(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "indian_ts_secret")
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    owner = create_user(db_session, role_name="owner", email="owner_indian_ts@example.com")
    tenancy = _seed_tenancy_with_van(db_session, owner.id)
    _seed_invoice(db_session, tenancy, amount="5000.00")

    now_indian = utc_now().strftime("%d/%m/%Y %H:%M:%S")
    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "5000.00",
        "utr_number": "UTR_INDIAN_TS_001",
        "timestamp": now_indian,
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, "indian_ts_secret")

    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={"Content-Type": "application/json", "X-Webhook-Signature": sig},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_webhook_smart_collect_ip_whitelist_cidr(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "cidr_secret")
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", ["103.14.160.0/24"])

    owner = create_user(db_session, role_name="owner", email="owner_cidr@example.com")
    tenancy = _seed_tenancy_with_van(db_session, owner.id)
    _seed_invoice(db_session, tenancy, amount="3000.00")

    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "3000.00",
        "utr_number": "UTR_CIDR_PASS",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, "cidr_secret")

    response = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": sig,
            "X-Forwarded-For": "103.14.160.55",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"

    response_blocked = client.post(
        "/api/v1/payments/webhook/smart-collect",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": sig,
            "X-Forwarded-For": "103.14.161.55",
        },
    )
    assert response_blocked.status_code == 403


def test_webhook_smart_collect_concurrent_identical_requests(client, db_session, monkeypatch):
    import concurrent.futures

    monkeypatch.setattr(settings, "smart_collect_webhook_secret", "secret_concurrent")
    monkeypatch.setattr(settings, "smart_collect_whitelisted_ips", [])

    owner = create_user(db_session, role_name="owner", email="owner_concurrent@example.com")
    tenancy = _seed_tenancy_with_van(db_session, owner.id)
    _seed_invoice(db_session, tenancy, amount="5000.00")

    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "5000.00",
        "utr_number": "UTR_RACE_CONDITION_001",
        "bank_reference": "REF_RACE_001",
    }
    body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(body, "secret_concurrent")
    headers = {"Content-Type": "application/json", "X-Webhook-Signature": sig}

    def call_webhook():
        return client.post("/api/v1/payments/webhook/smart-collect", data=body, headers=headers)

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(call_webhook) for _ in range(3)]
        responses = [f.result() for f in futures]

    for r in responses:
        assert r.status_code == 200

    statuses = [r.json()["status"] for r in responses]
    assert "success" in statuses

    db_session.expire_all()
    ledger_entries = list(
        db_session.scalars(
            select(LedgerEntry).where(
                LedgerEntry.tenancy_id == tenancy.id,
                LedgerEntry.entry_type == "rent",
            )
        )
    )
    total_credited = sum(e.amount for e in ledger_entries)
    assert total_credited == Decimal("5000.00")

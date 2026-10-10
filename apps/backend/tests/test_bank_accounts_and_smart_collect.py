"""
Unit & Integration Tests for KaramStay Multi-Account Bank Architecture.

Verifies:
  1. Central Master Bank Accounts Registry & Operator Controls (app/core/bank_accounts.py)
  2. Property Bank Account Selection & API Endpoints
  3. Tenancy Virtual Account Allocation across HDFC 1, HDFC 2, and NKGSB
  4. Webhook Cryptographic Verification, Multi-Account Routing, and FIFO Reconciliation
  5. Operator Kill-Switch (ON / OFF) service pause behavior per bank
"""

import hashlib
import hmac
import json
from datetime import date
from decimal import Decimal

from app.core.bank_accounts import (
    BankAccountConfig,
    add_bank_account,
    delete_bank_account,
    get_bank_account,
    get_webhook_secret_for_account,
    is_service_active,
    list_bank_accounts,
    pause_all_accounts,
    pause_bank_account,
    resolve_bank_account_for_van,
    resume_all_accounts,
    resume_bank_account,
)
from app.core.security import utc_now
from app.features.payments.models import Invoice
from app.features.payments.smart_collect import (
    assign_virtual_account_to_tenancy,
    generate_virtual_account,
)
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user


def _generate_hmac_header(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# 1. Master Bank Accounts Registry & Operator Controls Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_registry_contains_three_primary_accounts():
    """Verify registry exposes exactly the 3 configured accounts: HDFC 1, HDFC 2, NKGSB."""
    accounts = list_bank_accounts(active_only=True, include_legacy=False)
    account_keys = [a.key for a in accounts]

    assert "hdfc_1" in account_keys
    assert "hdfc_2" in account_keys
    assert "nkgsb_1" in account_keys

    hdfc1 = get_bank_account("hdfc_1")
    assert hdfc1 is not None
    assert hdfc1.van_prefix == "KARMH1"
    assert hdfc1.ifsc == "HDFC0000060"
    assert "{van}@hdfcbank" in hdfc1.upi_handle_template
    assert hdfc1.is_active is True

    hdfc2 = get_bank_account("hdfc_2")
    assert hdfc2 is not None
    assert hdfc2.van_prefix == "KARMH2"
    assert hdfc2.ifsc == "HDFC0000060"
    assert "{van}@hdfcbank" in hdfc2.upi_handle_template
    assert hdfc2.is_active is True

    nkgsb = get_bank_account("nkgsb_1")
    assert nkgsb is not None
    assert nkgsb.van_prefix == "KARMN1"
    assert nkgsb.ifsc == "NKGS0000001"
    assert "{van}@nkgsb" in nkgsb.upi_handle_template
    assert nkgsb.is_active is True


def test_van_prefix_matching_precision():
    """Verify VAN matching correctly identifies bank accounts by prefix without shadowing."""
    acc_h1 = resolve_bank_account_for_van("KARMH1000501")
    assert acc_h1 is not None and acc_h1.key == "hdfc_1"

    acc_h2 = resolve_bank_account_for_van("KARMH2000501")
    assert acc_h2 is not None and acc_h2.key == "hdfc_2"

    acc_nk = resolve_bank_account_for_van("KARMN1000501")
    assert acc_nk is not None and acc_nk.key == "nkgsb_1"

    # Legacy prefix matching
    acc_leg_hdfc = resolve_bank_account_for_van("KARMH000501")
    assert acc_leg_hdfc is not None and acc_leg_hdfc.key == "hdfc"

    acc_leg_icici = resolve_bank_account_for_van("KARMI000501")
    assert acc_leg_icici is not None and acc_leg_icici.key == "icici"


def test_operator_add_and_delete_bank_account():
    """Verify operator can add and delete bank accounts dynamically."""
    custom_acc = BankAccountConfig(
        key="custom_axis_1",
        name="Axis Bank - Current Account",
        bank_name="Axis Bank",
        account_number="918020001234567",
        account_holder_name="KaramStay LLP",
        van_prefix="KARMA1",
        ifsc="UTIB0000123",
        upi_handle_template="{van}@axisbank",
        webhook_secret_env_var="AXIS_WEBHOOK_SECRET",
        default_webhook_secret="axis_secret_fallback",
        is_active=True,
    )

    add_bank_account(custom_acc)
    fetched = get_bank_account("custom_axis_1")
    assert fetched is not None
    assert fetched.van_prefix == "KARMA1"
    assert resolve_bank_account_for_van("KARMA1000999").key == "custom_axis_1"

    # Operator deletion
    assert delete_bank_account("custom_axis_1") is True
    assert get_bank_account("custom_axis_1") is None
    assert delete_bank_account("non_existent") is False


def test_operator_kill_switch_pause_and_resume():
    """Verify operator can pause individual accounts or all accounts."""
    try:
        assert is_service_active("hdfc_1") is True
        assert pause_bank_account("hdfc_1") is True
        assert is_service_active("hdfc_1") is False

        # Other accounts remain online
        assert is_service_active("hdfc_2") is True
        assert is_service_active("nkgsb_1") is True

        # Resume hdfc_1
        assert resume_bank_account("hdfc_1") is True
        assert is_service_active("hdfc_1") is True

        # Global emergency pause
        pause_all_accounts()
        assert is_service_active("hdfc_1") is False
        assert is_service_active("hdfc_2") is False
        assert is_service_active("nkgsb_1") is False

        # Global resume
        resume_all_accounts()
        assert is_service_active("hdfc_1") is True
        assert is_service_active("hdfc_2") is True
        assert is_service_active("nkgsb_1") is True
    finally:
        resume_all_accounts()


def test_webhook_secret_environment_variable_override(monkeypatch):
    """Verify environment variable overrides default webhook secret."""
    hdfc1 = get_bank_account("hdfc_1")
    assert hdfc1 is not None

    default_sec = get_webhook_secret_for_account(hdfc1)
    assert default_sec == hdfc1.default_webhook_secret

    monkeypatch.setenv("HDFC_1_WEBHOOK_SECRET", "custom_super_secure_env_secret")
    env_sec = get_webhook_secret_for_account(hdfc1)
    assert env_sec == "custom_super_secure_env_secret"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Property Bank Selection API Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_get_property_bank_accounts_endpoint(client, db_session):
    """Verify GET /api/v1/properties/bank-accounts returns all active accounts."""
    create_user(db_session, role_name="owner", email="owner_banks@example.com")
    headers = auth_headers(client, email="owner_banks@example.com")

    res = client.get("/api/v1/properties/bank-accounts", headers=headers)
    assert res.status_code == 200
    accounts = res.json()
    assert len(accounts) >= 3

    keys = [a["key"] for a in accounts]
    assert "hdfc_1" in keys
    assert "hdfc_2" in keys
    assert "nkgsb_1" in keys

    # Also verify /payments/bank-accounts route
    res_payments = client.get("/api/v1/payments/bank-accounts", headers=headers)
    assert res_payments.status_code == 200
    assert len(res_payments.json()) >= 3


def test_property_creation_and_update_with_bank_account_key(client, db_session):
    """Verify owner can specify bank_account_key when creating and updating a property."""
    create_user(db_session, role_name="owner", email="owner_prop_bank@example.com")
    headers = auth_headers(client, email="owner_prop_bank@example.com")

    # 1. Create property defaulting to hdfc_1
    res1 = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "name": "Karam Residency Alpha",
            "address": "Sector 62, Noida",
            "property_type": "Apartment",
        },
    )
    assert res1.status_code == 201
    prop1_data = res1.json()
    assert prop1_data["bank_account_key"] == "hdfc_1"

    # 2. Create property explicitly selecting nkgsb_1
    res2 = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "name": "Karam Residency Beta",
            "address": "DLF Phase 3, Gurgaon",
            "property_type": "Apartment",
            "bank_account_key": "nkgsb_1",
        },
    )
    assert res2.status_code == 201
    prop2_data = res2.json()
    assert prop2_data["bank_account_key"] == "nkgsb_1"

    # 3. Update property 1 to hdfc_2
    res_update = client.patch(
        f"/api/v1/properties/{prop1_data['id']}",
        headers=headers,
        json={"bank_account_key": "hdfc_2"},
    )
    assert res_update.status_code == 200
    assert res_update.json()["bank_account_key"] == "hdfc_2"


# ─────────────────────────────────────────────────────────────────────────────
# 3. Virtual Account Allocation Tests Across 3 Banks
# ─────────────────────────────────────────────────────────────────────────────

def test_virtual_account_generation_across_all_accounts():
    """Verify virtual account format for all 3 bank accounts."""
    h1_va = generate_virtual_account(501, bank_provider="hdfc_1")
    assert h1_va["virtual_account_number"] == "KARMH1000501"
    assert h1_va["virtual_ifsc"] == "HDFC0000060"
    assert h1_va["virtual_vpa"] == "karmh1000501@hdfcbank"
    assert h1_va["bank_provider"] == "hdfc_1"

    h2_va = generate_virtual_account(501, bank_provider="hdfc_2")
    assert h2_va["virtual_account_number"] == "KARMH2000501"
    assert h2_va["virtual_ifsc"] == "HDFC0000060"
    assert h2_va["virtual_vpa"] == "karmh2000501@hdfcbank"
    assert h2_va["bank_provider"] == "hdfc_2"

    nk_va = generate_virtual_account(501, bank_provider="nkgsb_1")
    assert nk_va["virtual_account_number"] == "KARMN1000501"
    assert nk_va["virtual_ifsc"] == "NKGS0000001"
    assert nk_va["virtual_vpa"] == "karmn1000501@nkgsb"
    assert nk_va["bank_provider"] == "nkgsb_1"


def test_assign_virtual_account_resolves_property_bank_key(db_session):
    """Verify assigning VA to tenancy uses property's configured bank account key."""
    owner = create_user(db_session, role_name="owner", email="owner_va_test@example.com")

    # Property linked to NKGSB
    prop_nkgsb = Property(
        owner_id=owner.id,
        name="NKGSB Residency",
        address="Bandra West, Mumbai",
        property_type="Apartment",
        bank_account_key="nkgsb_1",
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    db_session.add(prop_nkgsb)
    db_session.flush()

    unit = Unit(property_id=prop_nkgsb.id, unit_no="401", unit_type="1BHK", rent=20000, deposit=20000)
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(name="Rahul Varma", phone="+919800011122")
    db_session.add(tenant)
    db_session.flush()

    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=unit.id,
        start_date=date(2026, 8, 1),
        monthly_rent=Decimal("20000.00"),
        security_deposit=Decimal("20000.00"),
        status="active",
    )
    db_session.add(tenancy)
    db_session.commit()

    assign_virtual_account_to_tenancy(db_session, tenancy)
    db_session.commit()
    db_session.refresh(tenancy)
    db_session.refresh(tenant)

    assert tenancy.virtual_account_number.startswith("KARMN1")
    assert tenancy.virtual_ifsc == "NKGS0000001"
    assert tenancy.virtual_vpa == f"{tenancy.virtual_account_number.lower()}@nkgsb"
    assert tenancy.bank_provider == "nkgsb_1"
    assert tenant.virtual_account_number == tenancy.virtual_account_number


# ─────────────────────────────────────────────────────────────────────────────
# 4. Webhook Reconciliation & Kill-Switch Tests Across All 3 Accounts
# ─────────────────────────────────────────────────────────────────────────────

def _seed_tenancy_for_bank(
    db_session,
    owner_id: int,
    bank_account_key: str,
) -> tuple[Tenancy, Invoice]:
    prop = Property(
        owner_id=owner_id,
        name=f"Property for {bank_account_key}",
        address="100 Commercial St",
        property_type="Apartment",
        bank_account_key=bank_account_key,
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(prop)
    db_session.flush()

    unit = Unit(property_id=prop.id, unit_no="U-1", unit_type="room", rent=10000, deposit=10000)
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(name=f"Tenant for {bank_account_key}", phone="+919911002233")
    db_session.add(tenant)
    db_session.flush()

    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=unit.id,
        start_date=date(2026, 9, 1),
        monthly_rent=Decimal("10000.00"),
        security_deposit=Decimal("10000.00"),
        status="active",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(tenancy)
    db_session.flush()

    assign_virtual_account_to_tenancy(db_session, tenancy)

    invoice = Invoice(
        tenancy_id=tenancy.id,
        billing_period="2026-09",
        due_date=date(2026, 9, 5),
        amount=Decimal("10000.00"),
        status="pending",
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(tenancy)
    db_session.refresh(invoice)
    return tenancy, invoice


def test_smart_collect_webhook_reconciliation_for_hdfc1(client, db_session):
    """Verify webhook reconciliation into HDFC Account 1."""
    owner = create_user(db_session, role_name="owner", email="owner_wh_h1@example.com")
    tenancy, invoice = _seed_tenancy_for_bank(db_session, owner.id, "hdfc_1")

    account = get_bank_account("hdfc_1")
    secret = get_webhook_secret_for_account(account)

    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "10000.00",
        "utr_number": "UTR_HDFC1_TEST_001",
        "bank_reference": "REF_HDFC1_001",
        "payment_mode": "NEFT",
        "timestamp": utc_now().isoformat(),
    }
    raw_body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(raw_body, secret)

    headers = {
        "Content-Type": "application/json",
        "x-webhook-signature": sig,
    }
    res = client.post("/api/v1/payments/webhook/smart-collect", headers=headers, content=raw_body)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["amount"] == 10000.0

    db_session.refresh(invoice)
    assert invoice.status == "paid"


def test_smart_collect_webhook_reconciliation_for_hdfc2(client, db_session):
    """Verify webhook reconciliation into HDFC Account 2."""
    owner = create_user(db_session, role_name="owner", email="owner_wh_h2@example.com")
    tenancy, invoice = _seed_tenancy_for_bank(db_session, owner.id, "hdfc_2")

    account = get_bank_account("hdfc_2")
    secret = get_webhook_secret_for_account(account)

    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "10000.00",
        "utr_number": "UTR_HDFC2_TEST_002",
        "bank_reference": "REF_HDFC2_002",
        "payment_mode": "IMPS",
        "timestamp": utc_now().isoformat(),
    }
    raw_body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(raw_body, secret)

    headers = {
        "Content-Type": "application/json",
        "x-webhook-signature": sig,
    }
    res = client.post("/api/v1/payments/webhook/smart-collect", headers=headers, content=raw_body)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["amount"] == 10000.0

    db_session.refresh(invoice)
    assert invoice.status == "paid"


def test_smart_collect_webhook_reconciliation_for_nkgsb(client, db_session):
    """Verify webhook reconciliation into NKGSB Bank Account."""
    owner = create_user(db_session, role_name="owner", email="owner_wh_nk@example.com")
    tenancy, invoice = _seed_tenancy_for_bank(db_session, owner.id, "nkgsb_1")

    account = get_bank_account("nkgsb_1")
    secret = get_webhook_secret_for_account(account)

    payload = {
        "virtual_account_number": tenancy.virtual_account_number,
        "amount": "10000.00",
        "utr_number": "UTR_NKGSB_TEST_003",
        "bank_reference": "REF_NKGSB_003",
        "payment_mode": "RTGS",
        "timestamp": utc_now().isoformat(),
    }
    raw_body = json.dumps(payload).encode("utf-8")
    sig = _generate_hmac_header(raw_body, secret)

    headers = {
        "Content-Type": "application/json",
        "x-webhook-signature": sig,
    }
    res = client.post("/api/v1/payments/webhook/smart-collect", headers=headers, content=raw_body)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["amount"] == 10000.0

    db_session.refresh(invoice)
    assert invoice.status == "paid"


def test_operator_kill_switch_rejects_webhook_with_503(client, db_session):
    """Verify that pausing a bank account immediately returns HTTP 503 for that bank's webhook."""
    try:
        owner = create_user(db_session, role_name="owner", email="owner_killswitch@example.com")
        tenancy, invoice = _seed_tenancy_for_bank(db_session, owner.id, "hdfc_1")

        account = get_bank_account("hdfc_1")
        secret = get_webhook_secret_for_account(account)

        payload = {
            "virtual_account_number": tenancy.virtual_account_number,
            "amount": "10000.00",
            "utr_number": "UTR_PAUSE_TEST_001",
            "bank_reference": "REF_PAUSE_001",
            "timestamp": utc_now().isoformat(),
        }
        raw_body = json.dumps(payload).encode("utf-8")
        sig = _generate_hmac_header(raw_body, secret)
        headers = {"Content-Type": "application/json", "x-webhook-signature": sig}

        # 1. Pause HDFC 1
        pause_bank_account("hdfc_1")

        # 2. Webhook to paused bank rejected with HTTP 503
        res = client.post("/api/v1/payments/webhook/smart-collect", headers=headers, content=raw_body)
        assert res.status_code == 503
        error_msg = res.json().get("message") or res.json().get("detail") or ""
        assert "Bank account collection service is paused for" in error_msg

        # 3. Resume HDFC 1
        resume_bank_account("hdfc_1")

        # 4. Webhook succeeds upon resume
        res_resumed = client.post("/api/v1/payments/webhook/smart-collect", headers=headers, content=raw_body)
        assert res_resumed.status_code == 200
        assert res_resumed.json()["status"] == "success"
    finally:
        resume_all_accounts()

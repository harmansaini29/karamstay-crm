import base64
from datetime import date
from decimal import Decimal

from app.core.security import utc_now
from app.features.agreements.models import Agreement
from app.features.payments.models import Invoice, LedgerEntry
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user


def test_check_in_creates_paperwork_fee_and_initial_invoice(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner_pw@test.com")
    prop = Property(owner_id=owner.id, name="Test PG", address="Street 1", property_type="PG")
    db_session.add(prop)
    db_session.flush()

    unit = Unit(
        property_id=prop.id,
        unit_no="Room 101",
        unit_type="private",
        rent=8000,
        deposit=8000,
        status="vacant",
    )
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(name="Arjun Singh", phone="+919876543299", created_by_id=owner.id)
    db_session.add(tenant)
    db_session.flush()

    headers = auth_headers(client, email=owner.email)
    payload = {
        "tenant_id": tenant.id,
        "unit_id": unit.id,
        "start_date": str(utc_now().date()),
        "monthly_rent": 8500.0,
        "security_deposit": 10000.0,
        "paperwork_fee": 750.0,
        "billing_day": 5,
        "installment_count": 1,
    }
    response = client.post("/api/v1/tenancies", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    data = response.json()
    assert float(data["paperwork_fee"]) == 750.0

    # Verify ledger entries include paperwork_fee
    entries = db_session.query(LedgerEntry).filter(LedgerEntry.tenancy_id == data["id"]).all()
    types = {e.entry_type: float(e.amount) for e in entries}
    assert types.get("paperwork_fee") == 750.0
    assert types.get("security_deposit") == 10000.0
    assert types.get("rent") == 8500.0

    # Verify initial invoice was auto-created for rent + deposit + paperwork_fee = 19250.0
    invoice = db_session.query(Invoice).filter(Invoice.tenancy_id == data["id"]).first()
    assert invoice is not None
    assert float(invoice.amount) == 19250.0
    assert invoice.status == "pending"


def test_staff_dashboard_hides_revenue_and_pending_dues(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner_dash@test.com")
    staff = create_user(db_session, role_name="staff", email="staff_dash@test.com")

    prop = Property(owner_id=owner.id, name="Staff Guard PG", address="Sector 21", property_type="PG")
    db_session.add(prop)
    db_session.flush()

    unit = Unit(
        property_id=prop.id,
        unit_no="202",
        unit_type="room",
        rent=12000,
        deposit=12000,
        status="occupied",
    )
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(name="Aman Verma", phone="+919810000088")
    db_session.add(tenant)
    db_session.flush()

    today = utc_now().date()
    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=unit.id,
        start_date=date(2026, 1, 1),
        monthly_rent=Decimal("12000.00"),
        security_deposit=Decimal("12000.00"),
        status="active",
    )
    db_session.add(tenancy)
    db_session.flush()

    invoice = Invoice(
        tenancy_id=tenancy.id,
        billing_period=today.strftime("%Y-%m"),
        due_date=today,
        amount=Decimal("12000.00"),
        status="pending",
    )
    db_session.add(invoice)
    db_session.commit()

    # Owner should see real revenue and dues
    owner_headers = auth_headers(client, email=owner.email)
    owner_res = client.get("/api/v1/analytics/dashboard", headers=owner_headers)
    assert owner_res.status_code == 200
    owner_data = owner_res.json()
    assert float(owner_data["pending_dues_total"]) >= 12000.0

    # Staff must see 0.00 for revenue and dues
    staff_headers = auth_headers(client, email=staff.email)
    staff_res = client.get("/api/v1/analytics/dashboard", headers=staff_headers)
    assert staff_res.status_code == 200
    staff_data = staff_res.json()
    assert float(staff_data["revenue_this_month"]) == 0.0
    assert float(staff_data["pending_dues_total"]) == 0.0


def test_replace_docx_agreement_endpoint(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner_docx@test.com")
    prop = Property(owner_id=owner.id, name="Docx PG", address="City", property_type="PG")
    db_session.add(prop)
    db_session.flush()

    unit = Unit(property_id=prop.id, unit_no="U1", unit_type="room", rent=5000, deposit=5000)
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(name="Test Tenant", phone="+919999999901")
    db_session.add(tenant)
    db_session.flush()

    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=unit.id,
        start_date=utc_now().date(),
        monthly_rent=Decimal("5000.00"),
        security_deposit=Decimal("5000.00"),
    )
    db_session.add(tenancy)
    db_session.flush()

    agreement = Agreement(
        tenancy_id=tenancy.id,
        tenant_id=tenant.id,
        template_id="A",
        template_name="Standard Agreement",
        status="pending_tenant_fill",
        tracker_stage=1,
    )
    db_session.add(agreement)
    db_session.commit()

    headers = auth_headers(client, email=owner.email)
    dummy_docx_content = base64.b64encode(b"PK\x03\x04test_docx_content").decode("utf-8")
    payload = {
        "file_name": "reissued_agreement_11month.docx",
        "file_base64": dummy_docx_content,
    }
    res = client.post(f"/api/v1/agreements/{agreement.id}/replace-docx", json=payload, headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["docx_file_name"] == "reissued_agreement_11month.docx"
    assert data["docx_generated_at"] is not None
    assert data["tracker_stage"] >= 2

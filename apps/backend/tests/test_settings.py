from datetime import date, timedelta
from decimal import Decimal

from app.core.security import utc_now
from app.features.payments.jobs import accrue_late_fees
from app.features.payments.models import Invoice
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user


def test_get_settings_returns_defaults(client, db_session):
    create_user(db_session, role_name="owner", email="owner@example.com")
    headers = auth_headers(client, email="owner@example.com")

    response = client.get("/api/v1/settings", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["late_fee_grace_days"] == 3
    assert body["agreement_reminder_days"] == [30, 15, 7, 1]
    assert body["whatsapp_otp_template"] == "karamstay_otp_login"


def test_update_settings_persists_and_returns_new_values(client, db_session):
    create_user(db_session, role_name="owner", email="owner2@example.com")
    headers = auth_headers(client, email="owner2@example.com")

    response = client.patch(
        "/api/v1/settings",
        headers=headers,
        json={
            "late_fee_grace_days": 5,
            "late_fee_percent_per_day": "2.50",
            "agreement_reminder_days": [45, 20, 10, 2],
            "brand_name": "Karam Homes",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["late_fee_grace_days"] == 5
    assert body["late_fee_percent_per_day"] == "2.50"
    assert body["agreement_reminder_days"] == [45, 20, 10, 2]
    assert body["brand_name"] == "Karam Homes"

    refetch = client.get("/api/v1/settings", headers=headers)
    assert refetch.json()["late_fee_grace_days"] == 5


def test_non_owner_cannot_read_or_update_settings(client, db_session):
    create_user(db_session, role_name="manager", email="manager@example.com")
    headers = auth_headers(client, email="manager@example.com")

    assert client.get("/api/v1/settings", headers=headers).status_code == 403
    assert client.patch("/api/v1/settings", headers=headers, json={"brand_name": "X"}).status_code == 403


def test_late_fee_job_uses_updated_settings(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner3@example.com")
    headers = auth_headers(client, email="owner3@example.com")

    client.patch(
        "/api/v1/settings",
        headers=headers,
        json={"late_fee_grace_days": 0, "late_fee_percent_per_day": "10.00"},
    )

    property_ = Property(
        owner_id=owner.id,
        name="Karam PG",
        address="MG Road",
        property_type="PG",
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    db_session.add(property_)
    db_session.flush()

    unit = Unit(
        property_id=property_.id,
        unit_no="101",
        unit_type="room",
        rent=10000,
        deposit=10000,
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(name="Ravi Kumar", phone="+919810000080")
    db_session.add(tenant)
    db_session.flush()

    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=unit.id,
        start_date=date(2026, 1, 1),
        monthly_rent=Decimal("10000.00"),
        security_deposit=Decimal("10000.00"),
        status="active",
    )
    db_session.add(tenancy)
    db_session.flush()

    overdue_invoice = Invoice(
        tenancy_id=tenancy.id,
        billing_period="2026-05",
        due_date=utc_now().date() - timedelta(days=2),
        amount=Decimal("10000.00"),
        status="pending",
    )
    db_session.add(overdue_invoice)
    db_session.commit()

    accrue_late_fees()

    db_session.refresh(overdue_invoice)
    assert overdue_invoice.status == "overdue"
    assert overdue_invoice.late_fee_amount == Decimal("2000.00")
    assert owner.id is not None

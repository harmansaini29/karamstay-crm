from datetime import date
from decimal import Decimal

from app.features.payments.models import Invoice
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user


def _seed_tenancy(db_session, owner_id: int) -> Tenancy:
    property_ = Property(
        owner_id=owner_id,
        name="Karam PG",
        address="MG Road, Jaipur",
        property_type="PG",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(property_)
    db_session.flush()

    unit = Unit(
        property_id=property_.id,
        unit_no="101",
        unit_type="room",
        rent=10000,
        deposit=10000,
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(name="Ravi Kumar", phone="+919810000020")
    db_session.add(tenant)
    db_session.flush()

    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=unit.id,
        start_date=date(2026, 7, 1),
        monthly_rent=Decimal("10000.00"),
        security_deposit=Decimal("10000.00"),
        status="active",
    )
    db_session.add(tenancy)
    db_session.commit()
    db_session.refresh(tenancy)
    return tenancy


def _seed_invoice(db_session, tenancy: Tenancy, amount: str = "10000.00") -> Invoice:
    invoice = Invoice(
        tenancy_id=tenancy.id,
        billing_period="2026-07",
        due_date=date(2026, 7, 5),
        amount=Decimal(amount),
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)
    return invoice


def test_create_invoice_and_list(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner@example.com")
    headers = auth_headers(client, email="owner@example.com")
    tenancy = _seed_tenancy(db_session, owner.id)

    response = client.post(
        "/api/v1/invoices",
        headers=headers,
        json={
            "tenancy_id": tenancy.id,
            "billing_period": "2026-08",
            "due_date": "2026-08-05",
            "amount": "10000.00",
        },
    )
    assert response.status_code == 201

    duplicate = client.post(
        "/api/v1/invoices",
        headers=headers,
        json={
            "tenancy_id": tenancy.id,
            "billing_period": "2026-08",
            "due_date": "2026-08-05",
            "amount": "10000.00",
        },
    )
    assert duplicate.status_code == 409

    listing = client.get("/api/v1/invoices", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1


def test_verifying_an_already_verified_payment_is_rejected(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-idempotent@example.com")
    owner_headers = auth_headers(client, email="owner-idempotent@example.com")
    tenancy = _seed_tenancy(db_session, owner.id)
    invoice = _seed_invoice(db_session, tenancy)

    tenant_row = db_session.get(Tenant, tenancy.tenant_id)
    tenant_row.user_id = create_user(
        db_session,
        role_name="tenant",
        email="tenant-idempotent@example.com",
        phone=tenant_row.phone + "v",
    ).id
    db_session.commit()
    tenant_headers = auth_headers(client, email="tenant-idempotent@example.com")

    submit = client.post(
        "/api/v1/payments/upi/submit",
        headers=tenant_headers,
        json={"invoice_id": invoice.id, "utr_number": "333333333333", "amount": "10000.00"},
    ).json()

    first = client.patch(
        f"/api/v1/payments/{submit['id']}/verify",
        headers=owner_headers,
        json={"approve": True},
    )
    second = client.patch(
        f"/api/v1/payments/{submit['id']}/verify",
        headers=owner_headers,
        json={"approve": True},
    )
    assert first.status_code == 200
    assert second.status_code == 409

    from app.features.payments.models import LedgerEntry

    credit_entries = db_session.query(LedgerEntry).filter_by(tenancy_id=tenancy.id, direction="credit").all()
    assert len(credit_entries) == 1


def test_upi_submit_then_owner_approve_settles_invoice(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-upi1@example.com")
    owner_headers = auth_headers(client, email="owner-upi1@example.com")
    tenancy = _seed_tenancy(db_session, owner.id)
    invoice = _seed_invoice(db_session, tenancy)

    tenant_row = db_session.get(Tenant, tenancy.tenant_id)
    tenant_row.user_id = create_user(
        db_session,
        role_name="tenant",
        email="tenant-upi1@example.com",
        phone=tenant_row.phone + "x",
    ).id
    db_session.commit()
    tenant_headers = auth_headers(client, email="tenant-upi1@example.com")

    submit = client.post(
        "/api/v1/payments/upi/submit",
        headers=tenant_headers,
        json={"invoice_id": invoice.id, "utr_number": "123456789012", "amount": "10000.00"},
    )
    assert submit.status_code == 201
    payment_id = submit.json()["id"]
    assert submit.json()["status"] == "submitted_pending_verification"

    approve = client.patch(
        f"/api/v1/payments/{payment_id}/verify",
        headers=owner_headers,
        json={"approve": True},
    )
    assert approve.status_code == 200
    assert approve.json()["status"] == "captured"

    db_session.refresh(invoice)
    assert invoice.status == "paid"


def test_upi_reject_requires_reason_and_leaves_invoice_unsettled(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-upi2@example.com")
    owner_headers = auth_headers(client, email="owner-upi2@example.com")
    tenancy = _seed_tenancy(db_session, owner.id)
    invoice = _seed_invoice(db_session, tenancy)

    tenant_row = db_session.get(Tenant, tenancy.tenant_id)
    tenant_row.user_id = create_user(
        db_session,
        role_name="tenant",
        email="tenant-upi2@example.com",
        phone=tenant_row.phone + "y",
    ).id
    db_session.commit()
    tenant_headers = auth_headers(client, email="tenant-upi2@example.com")

    submit = client.post(
        "/api/v1/payments/upi/submit",
        headers=tenant_headers,
        json={"invoice_id": invoice.id, "utr_number": "999999999999", "amount": "10000.00"},
    ).json()

    no_reason = client.patch(
        f"/api/v1/payments/{submit['id']}/verify",
        headers=owner_headers,
        json={"approve": False},
    )
    assert no_reason.status_code == 422

    rejected = client.patch(
        f"/api/v1/payments/{submit['id']}/verify",
        headers=owner_headers,
        json={"approve": False, "rejection_reason": "UTR does not match any received payment"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"

    db_session.refresh(invoice)
    assert invoice.status == "pending"


def test_tenant_cannot_verify_payment(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-upi3@example.com")
    tenancy = _seed_tenancy(db_session, owner.id)
    invoice = _seed_invoice(db_session, tenancy)

    tenant_row = db_session.get(Tenant, tenancy.tenant_id)
    tenant_row.user_id = create_user(
        db_session,
        role_name="tenant",
        email="tenant-upi3@example.com",
        phone=tenant_row.phone + "z",
    ).id
    db_session.commit()
    tenant_headers = auth_headers(client, email="tenant-upi3@example.com")

    submit = client.post(
        "/api/v1/payments/upi/submit",
        headers=tenant_headers,
        json={"invoice_id": invoice.id, "utr_number": "111111111111", "amount": "10000.00"},
    ).json()

    denied = client.patch(
        f"/api/v1/payments/{submit['id']}/verify",
        headers=tenant_headers,
        json={"approve": True},
    )
    assert denied.status_code == 403


def test_payments_list_filters_by_status(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-upi4@example.com")
    owner_headers = auth_headers(client, email="owner-upi4@example.com")
    tenancy = _seed_tenancy(db_session, owner.id)
    invoice = _seed_invoice(db_session, tenancy)

    tenant_row = db_session.get(Tenant, tenancy.tenant_id)
    tenant_row.user_id = create_user(
        db_session,
        role_name="tenant",
        email="tenant-upi4@example.com",
        phone=tenant_row.phone + "w",
    ).id
    db_session.commit()
    tenant_headers = auth_headers(client, email="tenant-upi4@example.com")

    client.post(
        "/api/v1/payments/upi/submit",
        headers=tenant_headers,
        json={"invoice_id": invoice.id, "utr_number": "222222222222", "amount": "10000.00"},
    )

    pending_queue = client.get(
        "/api/v1/payments?status=submitted_pending_verification",
        headers=owner_headers,
    )
    assert pending_queue.status_code == 200
    assert len(pending_queue.json()) == 1
    assert pending_queue.json()[0]["status"] == "submitted_pending_verification"


def test_expense_create_and_list(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner5@example.com")
    headers = auth_headers(client, email="owner5@example.com")
    property_ = Property(
        owner_id=owner.id,
        name="Karam PG 2",
        address="MG Road, Jaipur",
        property_type="PG",
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    db_session.add(property_)
    db_session.commit()
    db_session.refresh(property_)

    response = client.post(
        "/api/v1/expenses",
        headers=headers,
        json={
            "property_id": property_.id,
            "category": "Maintenance",
            "amount": "1500.00",
            "expense_date": "2026-07-10",
            "description": "Plumbing repair",
        },
    )
    assert response.status_code == 201

    listing = client.get(f"/api/v1/expenses?property_id={property_.id}", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1

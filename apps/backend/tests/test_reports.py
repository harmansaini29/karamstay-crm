from datetime import date
from decimal import Decimal

from app.features.maintenance.models import MaintenanceTicket
from app.features.payments.models import Expense, Invoice, Payment
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user


def _seed_scenario(db_session, owner_id: int) -> dict:
    property_ = Property(
        owner_id=owner_id,
        name="Karam PG",
        address="MG Road",
        property_type="PG",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(property_)
    db_session.flush()

    occupied_unit = Unit(
        property_id=property_.id,
        unit_no="101",
        unit_type="room",
        rent=10000,
        deposit=10000,
        status="occupied",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    vacant_unit = Unit(
        property_id=property_.id,
        unit_no="102",
        unit_type="room",
        rent=8000,
        deposit=8000,
        status="vacant",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add_all([occupied_unit, vacant_unit])
    db_session.flush()

    tenant = Tenant(name="Ravi Kumar", phone="+919810000060")
    db_session.add(tenant)
    db_session.flush()

    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=occupied_unit.id,
        start_date=date(2026, 7, 1),
        monthly_rent=Decimal("10000.00"),
        security_deposit=Decimal("10000.00"),
        status="active",
    )
    db_session.add(tenancy)
    db_session.flush()

    paid_invoice = Invoice(
        tenancy_id=tenancy.id,
        billing_period="2026-06",
        due_date=date(2026, 6, 5),
        amount=Decimal("10000.00"),
        status="paid",
    )
    overdue_invoice = Invoice(
        tenancy_id=tenancy.id,
        billing_period="2026-07",
        due_date=date(2026, 7, 5),
        amount=Decimal("10000.00"),
        late_fee_amount=Decimal("300.00"),
        status="overdue",
    )
    db_session.add_all([paid_invoice, overdue_invoice])
    db_session.flush()

    payment = Payment(
        invoice_id=paid_invoice.id,
        tenancy_id=tenancy.id,
        amount=Decimal("10000.00"),
        payment_type="rent",
        mode="upi",
        status="captured",
    )
    db_session.add(payment)

    expense = Expense(
        property_id=property_.id,
        category="Maintenance",
        amount=Decimal("500.00"),
        expense_date=date(2026, 7, 3),
    )
    db_session.add(expense)

    ticket = MaintenanceTicket(
        tenant_id=tenant.id,
        unit_id=occupied_unit.id,
        category="Plumbing",
        description="Leak",
        status="completed",
        cost=Decimal("500.00"),
    )
    db_session.add(ticket)

    db_session.commit()
    return {"property": property_, "tenant": tenant}


def test_occupancy_report(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner@example.com")
    headers = auth_headers(client, email="owner@example.com")
    _seed_scenario(db_session, owner.id)

    response = client.get("/api/v1/reports/occupancy", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total_units"] == 2
    assert body["occupied_units"] == 1
    assert body["occupancy_rate"] == 50.0


def test_revenue_and_collection_rate_for_billing_period(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner2@example.com")
    headers = auth_headers(client, email="owner2@example.com")
    _seed_scenario(db_session, owner.id)

    revenue = client.get("/api/v1/reports/revenue?billing_period=2026-06", headers=headers)
    assert revenue.status_code == 200
    assert revenue.json()["total_invoiced"] == "10000.00"
    assert revenue.json()["total_collected"] == "10000.00"

    rate = client.get("/api/v1/reports/collection-rate?billing_period=2026-06", headers=headers)
    assert rate.status_code == 200
    assert rate.json()["collection_rate"] == 100.0


def test_pending_dues_and_defaulters(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner3@example.com")
    headers = auth_headers(client, email="owner3@example.com")
    _seed_scenario(db_session, owner.id)

    pending = client.get("/api/v1/reports/pending-dues", headers=headers)
    assert pending.status_code == 200
    assert len(pending.json()) == 1
    assert pending.json()[0]["amount_due"] == "10300.00"

    defaulters = client.get("/api/v1/reports/defaulters", headers=headers)
    assert defaulters.status_code == 200
    assert len(defaulters.json()) == 1
    assert defaulters.json()[0]["tenant_name"] == "Ravi Kumar"


def test_expenses_and_maintenance_cost_reports(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner4@example.com")
    headers = auth_headers(client, email="owner4@example.com")
    _seed_scenario(db_session, owner.id)

    expenses = client.get("/api/v1/reports/expenses", headers=headers)
    assert expenses.status_code == 200
    assert expenses.json() == [{"category": "Maintenance", "total_amount": "500.00"}]

    maintenance_cost = client.get("/api/v1/reports/maintenance-cost", headers=headers)
    assert maintenance_cost.status_code == 200
    assert maintenance_cost.json()["total_cost"] == "500.00"
    assert maintenance_cost.json()["ticket_count"] == 1


def test_maintenance_cost_report_with_date_range_filters(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner5@example.com")
    headers = auth_headers(client, email="owner5@example.com")
    _seed_scenario(db_session, owner.id)

    response = client.get(
        "/api/v1/reports/maintenance-cost?start_date=2020-01-01&end_date=2030-01-01",
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["ticket_count"] == 1


def test_csv_export_returns_csv_content_type(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner6@example.com")
    headers = auth_headers(client, email="owner6@example.com")
    _seed_scenario(db_session, owner.id)

    response = client.get("/api/v1/reports/occupancy?export_format=csv", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert b"total_units" in response.content


def test_pdf_export_returns_pdf_content_type(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner7@example.com")
    headers = auth_headers(client, email="owner7@example.com")
    _seed_scenario(db_session, owner.id)

    response = client.get("/api/v1/reports/occupancy?export_format=pdf", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


def test_manager_cannot_access_unassigned_property(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner8@example.com")
    seeded = _seed_scenario(db_session, owner.id)
    create_user(db_session, role_name="manager", email="manager@example.com")
    headers = auth_headers(client, email="manager@example.com")

    response = client.get(
        f"/api/v1/reports/occupancy?property_id={seeded['property'].id}",
        headers=headers,
    )
    assert response.status_code == 403


def test_accountant_cannot_access_ops_report(client, db_session):
    create_user(db_session, role_name="accountant", email="accountant@example.com")
    headers = auth_headers(client, email="accountant@example.com")

    response = client.get("/api/v1/reports/occupancy", headers=headers)
    assert response.status_code == 403

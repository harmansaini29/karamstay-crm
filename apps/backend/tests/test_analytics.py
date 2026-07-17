from datetime import date, timedelta
from decimal import Decimal

from app.core.security import utc_now
from app.features.maintenance.models import MaintenanceTicket
from app.features.payments.models import Invoice, Payment
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user


def _seed_dashboard_scenario(db_session, owner_id: int) -> Property:
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
    db_session.add(occupied_unit)
    db_session.flush()

    tenant = Tenant(name="Ravi Kumar", phone="+919810000070")
    db_session.add(tenant)
    db_session.flush()

    today = utc_now().date()
    move_out_soon = today + timedelta(days=3)

    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=occupied_unit.id,
        start_date=date(2026, 1, 1),
        end_date=move_out_soon,
        monthly_rent=Decimal("10000.00"),
        security_deposit=Decimal("10000.00"),
        status="active",
    )
    db_session.add(tenancy)
    db_session.flush()

    billing_period = today.strftime("%Y-%m")
    invoice = Invoice(
        tenancy_id=tenancy.id,
        billing_period=billing_period,
        due_date=today,
        amount=Decimal("10000.00"),
        status="paid",
    )
    db_session.add(invoice)
    db_session.flush()

    payment = Payment(
        invoice_id=invoice.id,
        tenancy_id=tenancy.id,
        amount=Decimal("10000.00"),
        payment_type="rent",
        mode="upi",
        status="captured",
    )
    db_session.add(payment)

    ticket = MaintenanceTicket(
        tenant_id=tenant.id,
        unit_id=occupied_unit.id,
        category="Plumbing",
        description="Leak",
        status="open",
    )
    db_session.add(ticket)

    db_session.commit()
    return property_


def test_dashboard_aggregates_kpis(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner@example.com")
    headers = auth_headers(client, email="owner@example.com")
    _seed_dashboard_scenario(db_session, owner.id)

    response = client.get("/api/v1/analytics/dashboard", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["occupancy_rate"] == 100.0
    assert body["revenue_this_month"] == "10000.00"
    assert body["pending_dues_total"] == "0.00"
    assert body["open_maintenance_tickets"] == 1
    assert body["upcoming_move_outs"] == 1
    assert body["upcoming_move_ins"] == 0


def test_tenant_cannot_access_dashboard(client, db_session):
    create_user(db_session, role_name="tenant", email="tenant@example.com")
    headers = auth_headers(client, email="tenant@example.com")

    response = client.get("/api/v1/analytics/dashboard", headers=headers)
    assert response.status_code == 403


def test_manager_scoped_dashboard_for_unassigned_property(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner2@example.com")
    property_ = _seed_dashboard_scenario(db_session, owner.id)
    create_user(db_session, role_name="manager", email="manager@example.com")
    headers = auth_headers(client, email="manager@example.com")

    response = client.get(f"/api/v1/analytics/dashboard?property_id={property_.id}", headers=headers)
    assert response.status_code == 403

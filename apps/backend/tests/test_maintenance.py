from datetime import date
from decimal import Decimal

from app.features.payments.models import Expense
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user


def _seed_property_unit(db_session, owner_id: int) -> Unit:
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
    db_session.commit()
    db_session.refresh(unit)
    return unit


def _seed_tenant_with_active_tenancy(db_session, unit: Unit, phone: str) -> tuple[Tenant, "User"]:  # noqa: F821
    tenant = Tenant(name="Ravi Kumar", phone=phone)
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
    tenant_user = create_user(db_session, role_name="tenant", email=f"{phone}@example.com", phone=phone)
    tenant.user_id = tenant_user.id
    db_session.commit()
    return tenant, tenant_user


def test_tenant_can_create_ticket_for_own_unit(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner@example.com")
    unit = _seed_property_unit(db_session, owner.id)
    _tenant, tenant_user = _seed_tenant_with_active_tenancy(db_session, unit, "+919810000050")
    headers = auth_headers(client, email=tenant_user.email)

    response = client.post(
        "/api/v1/maintenance-tickets",
        headers=headers,
        json={"unit_id": unit.id, "category": "Plumbing", "description": "Leaking tap in the bathroom"},
    )
    assert response.status_code == 201
    assert response.json()["status"] == "open"


def test_tenant_cannot_create_ticket_for_unrelated_unit(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner2@example.com")
    unit = _seed_property_unit(db_session, owner.id)
    create_user(db_session, role_name="tenant", email="random-tenant@example.com", phone="+919810000051")
    headers = auth_headers(client, email="random-tenant@example.com")

    response = client.post(
        "/api/v1/maintenance-tickets",
        headers=headers,
        json={"unit_id": unit.id, "category": "Plumbing", "description": "Leaking tap"},
    )
    assert response.status_code == 403


def test_owner_can_progress_ticket_and_completion_creates_expense(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner3@example.com")
    headers = auth_headers(client, email="owner3@example.com")
    unit = _seed_property_unit(db_session, owner.id)
    tenant, tenant_user = _seed_tenant_with_active_tenancy(db_session, unit, "+919810000052")

    create_response = client.post(
        "/api/v1/maintenance-tickets",
        headers=auth_headers(client, email=tenant_user.email),
        json={"unit_id": unit.id, "category": "Electrical", "description": "Fan not working"},
    )
    ticket_id = create_response.json()["id"]

    in_progress = client.patch(
        f"/api/v1/maintenance-tickets/{ticket_id}",
        headers=headers,
        json={"status": "in_progress", "assigned_to_id": owner.id},
    )
    assert in_progress.status_code == 200

    completed = client.patch(
        f"/api/v1/maintenance-tickets/{ticket_id}",
        headers=headers,
        json={"status": "completed", "cost": "750.00"},
    )
    assert completed.status_code == 200
    assert completed.json()["resolved_at"] is not None

    expense = db_session.query(Expense).filter_by(maintenance_ticket_id=ticket_id).one()
    assert expense.amount == Decimal("750.00")
    assert expense.property_id == unit.property_id
    assert tenant.id is not None


def test_invalid_status_transition_rejected(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner4@example.com")
    headers = auth_headers(client, email="owner4@example.com")
    unit = _seed_property_unit(db_session, owner.id)

    create_response = client.post(
        "/api/v1/maintenance-tickets",
        headers=headers,
        json={"unit_id": unit.id, "category": "Cleaning", "description": "Common area cleaning"},
    )
    ticket_id = create_response.json()["id"]

    response = client.patch(
        f"/api/v1/maintenance-tickets/{ticket_id}",
        headers=headers,
        json={"status": "completed"},
    )
    assert response.status_code == 409


def test_tenant_cannot_update_ticket_status(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner5@example.com")
    unit = _seed_property_unit(db_session, owner.id)
    _tenant, tenant_user = _seed_tenant_with_active_tenancy(db_session, unit, "+919810000053")
    tenant_headers = auth_headers(client, email=tenant_user.email)

    create_response = client.post(
        "/api/v1/maintenance-tickets",
        headers=tenant_headers,
        json={"unit_id": unit.id, "category": "Plumbing", "description": "Tap issue"},
    )
    ticket_id = create_response.json()["id"]

    response = client.patch(
        f"/api/v1/maintenance-tickets/{ticket_id}",
        headers=tenant_headers,
        json={"status": "in_progress"},
    )
    assert response.status_code == 403

from datetime import date
from decimal import Decimal

from app.features.payments.models import Invoice
from app.features.properties.models import Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user


def test_property_payment_upi_id_persistence_and_separation(client, db_session):
    """Test that properties store separate payment UPI IDs and tenant invoices resolve the exact property UPI."""
    owner = create_user(db_session, role_name="owner", email="owner_upi@example.com")
    headers = auth_headers(client, email="owner_upi@example.com")

    # 1. Create Property A with UPI ID
    res_a = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "name": "Property Alpha",
            "address": "DLF Phase 1, Gurgaon",
            "property_type": "Apartment",
            "payment_upi_id": "alpha.karamstay@okhdfcbank",
        },
    )
    assert res_a.status_code == 201
    prop_a_id = res_a.json()["id"]
    assert res_a.json()["payment_upi_id"] == "alpha.karamstay@okhdfcbank"

    # 2. Create Property B with UPI ID
    res_b = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "name": "Property Beta",
            "address": "Sector 62, Noida",
            "property_type": "PG",
            "payment_upi_id": "beta.karamstay@okaxis",
        },
    )
    assert res_b.status_code == 201
    prop_b_id = res_b.json()["id"]
    assert res_b.json()["payment_upi_id"] == "beta.karamstay@okaxis"

    # 3. Add units
    unit_a = Unit(
        property_id=prop_a_id,
        unit_no="A-101",
        unit_type="1BHK",
        rent=12000,
        deposit=12000,
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    unit_b = Unit(
        property_id=prop_b_id,
        unit_no="B-201",
        unit_type="Studio",
        rent=15000,
        deposit=15000,
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    db_session.add_all([unit_a, unit_b])
    db_session.flush()

    # 4. Add tenants & tenancies
    tenant_a = Tenant(name="Tenant Alpha", phone="+919870000001", created_by_id=owner.id, updated_by_id=owner.id)
    tenant_b = Tenant(name="Tenant Beta", phone="+919870000002", created_by_id=owner.id, updated_by_id=owner.id)
    db_session.add_all([tenant_a, tenant_b])
    db_session.flush()

    tenancy_a = Tenancy(
        tenant_id=tenant_a.id,
        unit_id=unit_a.id,
        start_date=date(2026, 8, 1),
        monthly_rent=Decimal("12000.00"),
        security_deposit=Decimal("12000.00"),
        status="active",
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    tenancy_b = Tenancy(
        tenant_id=tenant_b.id,
        unit_id=unit_b.id,
        start_date=date(2026, 8, 1),
        monthly_rent=Decimal("15000.00"),
        security_deposit=Decimal("15000.00"),
        status="active",
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    db_session.add_all([tenancy_a, tenancy_b])
    db_session.flush()

    # 5. Create invoices for each
    inv_a = Invoice(
        tenancy_id=tenancy_a.id,
        billing_period="2026-08",
        due_date=date(2026, 8, 5),
        amount=Decimal("12000.00"),
    )
    inv_b = Invoice(
        tenancy_id=tenancy_b.id,
        billing_period="2026-08",
        due_date=date(2026, 8, 5),
        amount=Decimal("15000.00"),
    )
    db_session.add_all([inv_a, inv_b])
    db_session.commit()

    # 6. Fetch invoices and assert separate UPI IDs and property names
    res_inv_a = client.get(f"/api/v1/invoices/{inv_a.id}", headers=headers)
    assert res_inv_a.status_code == 200
    inv_a_data = res_inv_a.json()
    assert inv_a_data["payment_upi_id"] == "alpha.karamstay@okhdfcbank"
    assert inv_a_data["property_name"] == "Property Alpha"

    res_inv_b = client.get(f"/api/v1/invoices/{inv_b.id}", headers=headers)
    assert res_inv_b.status_code == 200
    inv_b_data = res_inv_b.json()
    assert inv_b_data["payment_upi_id"] == "beta.karamstay@okaxis"
    assert inv_b_data["property_name"] == "Property Beta"


def test_tenant_tenancy_context_without_prior_tenancy(client, db_session):
    """Test that newly registered tenant without tenancy returns 200 rather than crashing with 404."""
    create_user(db_session, role_name="tenant", email="new_tenant@example.com")
    headers = auth_headers(client, email="new_tenant@example.com")

    res = client.get("/api/v1/tenants/me/context", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "pending_assignment"
    assert data["unit"] is None

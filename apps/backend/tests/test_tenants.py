from app.features.properties.models import Bed, InventoryItem, Property, Unit
from tests.factories import auth_headers, create_user


def _create_property_and_unit(db_session, owner_id: int) -> Unit:
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
    db_session.commit()
    db_session.refresh(unit)
    return unit


def test_owner_can_create_tenant_and_check_in(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner@example.com")
    headers = auth_headers(client, email="owner@example.com")
    unit = _create_property_and_unit(db_session, owner.id)

    tenant_response = client.post(
        "/api/v1/tenants",
        headers=headers,
        json={"name": "Ravi Kumar", "phone": "+919810000001"},
    )
    assert tenant_response.status_code == 201
    tenant_id = tenant_response.json()["id"]

    checkin_response = client.post(
        "/api/v1/tenancies",
        headers=headers,
        json={
            "tenant_id": tenant_id,
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "10000.00",
            "security_deposit": "10000.00",
        },
    )
    assert checkin_response.status_code == 201
    body = checkin_response.json()
    assert body["status"] == "active"

    db_session.refresh(unit)
    assert unit.status == "occupied"


def test_cannot_check_in_twice_into_same_unit(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner2@example.com")
    headers = auth_headers(client, email="owner2@example.com")
    unit = _create_property_and_unit(db_session, owner.id)

    tenant_a = client.post(
        "/api/v1/tenants",
        headers=headers,
        json={"name": "Tenant A", "phone": "+919810000002"},
    ).json()
    tenant_b = client.post(
        "/api/v1/tenants",
        headers=headers,
        json={"name": "Tenant B", "phone": "+919810000003"},
    ).json()

    first = client.post(
        "/api/v1/tenancies",
        headers=headers,
        json={
            "tenant_id": tenant_a["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "10000.00",
            "security_deposit": "10000.00",
        },
    )
    assert first.status_code == 201

    second = client.post(
        "/api/v1/tenancies",
        headers=headers,
        json={
            "tenant_id": tenant_b["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-02",
            "monthly_rent": "10000.00",
            "security_deposit": "10000.00",
        },
    )
    assert second.status_code == 409


def test_checkout_computes_dues_and_frees_unit(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner3@example.com")
    headers = auth_headers(client, email="owner3@example.com")
    unit = _create_property_and_unit(db_session, owner.id)

    item = InventoryItem(unit_id=unit.id, name="Chair", created_by_id=owner.id, updated_by_id=owner.id)
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    tenant = client.post(
        "/api/v1/tenants",
        headers=headers,
        json={"name": "Tenant C", "phone": "+919810000004"},
    ).json()

    tenancy = client.post(
        "/api/v1/tenancies",
        headers=headers,
        json={
            "tenant_id": tenant["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "10000.00",
            "security_deposit": "10000.00",
        },
    ).json()

    checkout = client.post(
        f"/api/v1/tenancies/{tenancy['id']}/checkout",
        headers=headers,
        json={
            "move_out_date": "2026-07-15",
            "damage_charges": [{"inventory_item_id": item.id, "amount": "500.00", "note": "Broken chair"}],
        },
    )
    assert checkout.status_code == 200
    body = checkout.json()
    assert body["tenancy"]["status"] == "checked_out"
    assert body["damage_deduction"] == "500.00"
    assert body["outstanding_dues"] == "10000.00"
    assert body["deposit_refund"] == "0.00"

    db_session.refresh(unit)
    assert unit.status == "vacant"


def _create_shared_unit_with_beds(db_session, owner_id: int, bed_count: int = 3) -> tuple[Unit, list[Bed]]:
    property_ = Property(
        owner_id=owner_id,
        name="Karam PG Shared",
        address="MG Road, Jaipur",
        property_type="PG",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(property_)
    db_session.flush()

    unit = Unit(
        property_id=property_.id,
        unit_no="201",
        unit_type="room",
        rent=15000,
        deposit=15000,
        capacity=bed_count,
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(unit)
    db_session.flush()

    beds = [
        Bed(unit_id=unit.id, bed_no=str(i + 1), created_by_id=owner_id, updated_by_id=owner_id)
        for i in range(bed_count)
    ]
    for bed in beds:
        db_session.add(bed)
    db_session.commit()
    for bed in beds:
        db_session.refresh(bed)
    db_session.refresh(unit)
    return unit, beds


def test_two_tenants_can_book_separate_beds_in_same_unit(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-beds1@example.com")
    headers = auth_headers(client, email="owner-beds1@example.com")
    unit, beds = _create_shared_unit_with_beds(db_session, owner.id)

    tenant_a = client.post(
        "/api/v1/tenants",
        headers=headers,
        json={"name": "Bed Tenant A", "phone": "+919810000040"},
    ).json()
    tenant_b = client.post(
        "/api/v1/tenants",
        headers=headers,
        json={"name": "Bed Tenant B", "phone": "+919810000041"},
    ).json()

    first = client.post(
        "/api/v1/tenancies",
        headers=headers,
        json={
            "tenant_id": tenant_a["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "5000.00",
            "security_deposit": "5000.00",
            "bed_ids": [beds[0].id],
        },
    )
    assert first.status_code == 201

    second = client.post(
        "/api/v1/tenancies",
        headers=headers,
        json={
            "tenant_id": tenant_b["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "5000.00",
            "security_deposit": "5000.00",
            "bed_ids": [beds[1].id],
        },
    )
    assert second.status_code == 201

    db_session.refresh(unit)
    assert unit.status == "occupied"

    conflict = client.post(
        "/api/v1/tenancies",
        headers=headers,
        json={
            "tenant_id": tenant_a["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "5000.00",
            "security_deposit": "5000.00",
            "bed_ids": [beds[0].id],
        },
    )
    assert conflict.status_code == 409


def test_merging_beds_uses_manually_set_rent_not_sum(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-beds2@example.com")
    headers = auth_headers(client, email="owner-beds2@example.com")
    unit, beds = _create_shared_unit_with_beds(db_session, owner.id, bed_count=2)

    tenant = client.post(
        "/api/v1/tenants",
        headers=headers,
        json={"name": "Merge Tenant", "phone": "+919810000042"},
    ).json()

    merged = client.post(
        "/api/v1/tenancies",
        headers=headers,
        json={
            "tenant_id": tenant["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "9000.00",
            "security_deposit": "9000.00",
            "bed_ids": [beds[0].id, beds[1].id],
        },
    )
    assert merged.status_code == 201
    body = merged.json()
    assert set(body["bed_ids"]) == {beds[0].id, beds[1].id}
    assert body["monthly_rent"] == "9000.00"

    beds_listing = client.get(f"/api/v1/units/{unit.id}/beds", headers=headers)
    assert all(b["status"] == "occupied" for b in beds_listing.json())


def test_checkout_only_vacates_unit_once_all_bed_tenancies_end(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-beds3@example.com")
    headers = auth_headers(client, email="owner-beds3@example.com")
    unit, beds = _create_shared_unit_with_beds(db_session, owner.id, bed_count=2)

    tenant_a = client.post(
        "/api/v1/tenants",
        headers=headers,
        json={"name": "Bed Tenant C", "phone": "+919810000043"},
    ).json()
    tenant_b = client.post(
        "/api/v1/tenants",
        headers=headers,
        json={"name": "Bed Tenant D", "phone": "+919810000044"},
    ).json()

    tenancy_a = client.post(
        "/api/v1/tenancies",
        headers=headers,
        json={
            "tenant_id": tenant_a["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "5000.00",
            "security_deposit": "5000.00",
            "bed_ids": [beds[0].id],
        },
    ).json()
    client.post(
        "/api/v1/tenancies",
        headers=headers,
        json={
            "tenant_id": tenant_b["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "5000.00",
            "security_deposit": "5000.00",
            "bed_ids": [beds[1].id],
        },
    )

    checkout_a = client.post(
        f"/api/v1/tenancies/{tenancy_a['id']}/checkout",
        headers=headers,
        json={"move_out_date": "2026-07-15"},
    )
    assert checkout_a.status_code == 200

    db_session.refresh(unit)
    assert unit.status == "occupied", "unit must stay occupied while tenant B's bed tenancy is still active"

    db_session.refresh(beds[0])
    assert beds[0].status == "vacant"


def test_check_in_with_installments_splits_booking_dues(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-installments@example.com")
    headers = auth_headers(client, email="owner-installments@example.com")
    unit = _create_property_and_unit(db_session, owner.id)

    tenant = client.post(
        "/api/v1/tenants",
        headers=headers,
        json={"name": "Installment Tenant", "phone": "+919810000045"},
    ).json()

    checkin = client.post(
        "/api/v1/tenancies",
        headers=headers,
        json={
            "tenant_id": tenant["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "10000.00",
            "security_deposit": "10000.00",
            "installment_count": 3,
        },
    )
    assert checkin.status_code == 201
    tenancy_id = checkin.json()["id"]

    ledger = client.get(f"/api/v1/ledger?tenancy_id={tenancy_id}", headers=headers)
    entries = ledger.json()
    assert len(entries) == 3
    assert {e["entry_type"] for e in entries} == {"booking_installment"}
    total = sum(float(e["amount"]) for e in entries)
    assert round(total, 2) == 20000.00


def test_get_tenancy_detail_and_list(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-tlist@example.com")
    headers = auth_headers(client, email="owner-tlist@example.com")
    unit = _create_property_and_unit(db_session, owner.id)

    tenant = client.post(
        "/api/v1/tenants",
        headers=headers,
        json={"name": "List Tenant", "phone": "+919810000050"},
    ).json()
    tenancy = client.post(
        "/api/v1/tenancies",
        headers=headers,
        json={
            "tenant_id": tenant["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "10000.00",
            "security_deposit": "10000.00",
        },
    ).json()

    detail = client.get(f"/api/v1/tenancies/{tenancy['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["id"] == tenancy["id"]

    listing = client.get(f"/api/v1/tenancies?tenant_id={tenant['id']}", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1
    assert listing.json()[0]["tenant_id"] == tenant["id"]


def test_tenant_can_fetch_own_tenancy_context(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-ctx@example.com")
    owner_headers = auth_headers(client, email="owner-ctx@example.com")
    unit = _create_property_and_unit(db_session, owner.id)

    tenant = client.post(
        "/api/v1/tenants",
        headers=owner_headers,
        json={"name": "Ctx Tenant", "phone": "+919810000051"},
    ).json()
    client.post(
        "/api/v1/tenancies",
        headers=owner_headers,
        json={
            "tenant_id": tenant["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "10000.00",
            "security_deposit": "10000.00",
        },
    )

    from app.features.tenants.models import Tenant

    tenant_row = db_session.get(Tenant, tenant["id"])
    tenant_row.user_id = create_user(
        db_session,
        role_name="tenant",
        email="tenant-ctx@example.com",
        phone=tenant_row.phone + "x",
    ).id
    db_session.commit()
    tenant_headers = auth_headers(client, email="tenant-ctx@example.com")

    me = client.get("/api/v1/tenancies/me", headers=tenant_headers)
    assert me.status_code == 200
    body = me.json()
    assert body["tenant_id"] == tenant["id"]
    assert body["unit"] is not None
    assert body["unit"]["id"] == unit.id
    assert body["unit"]["property_name"] == "Karam PG"


def test_tenant_cannot_view_other_tenant_profile(client, db_session):
    create_user(db_session, role_name="owner", email="owner4@example.com")
    owner_headers = auth_headers(client, email="owner4@example.com")

    tenant_record = client.post(
        "/api/v1/tenants",
        headers=owner_headers,
        json={"name": "Tenant D", "phone": "+919810000005"},
    ).json()

    other_tenant_user = create_user(
        db_session,
        role_name="tenant",
        email="tenant-other@example.com",
        phone="+919810000099",
    )
    tenant_headers = auth_headers(client, email="tenant-other@example.com")

    response = client.get(f"/api/v1/tenants/{tenant_record['id']}", headers=tenant_headers)
    assert response.status_code == 403
    assert other_tenant_user.id != tenant_record["id"]

from datetime import date

from app.features.agreements.models import Agreement
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user


def _setup_tenancy(db_session, owner_id: int) -> tuple[Tenant, Tenancy]:
    prop = Property(
        owner_id=owner_id,
        name="Karam Residency",
        address="Sector 14, Gurgaon",
        property_type="Apartment",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(prop)
    db_session.flush()

    unit = Unit(
        property_id=prop.id,
        unit_no="A-101",
        unit_type="2BHK",
        rent=15000,
        deposit=15000,
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(
        name="Vikram Singh",
        phone="+919876500001",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(tenant)
    db_session.flush()

    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=unit.id,
        start_date=date(2026, 8, 1),
        monthly_rent=15000,
        security_deposit=15000,
        status="active",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(tenancy)
    db_session.commit()
    return tenant, tenancy


def test_agreements_crud_and_lifecycle(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner_ag@example.com")
    headers = auth_headers(client, email="owner_ag@example.com")
    tenant, tenancy = _setup_tenancy(db_session, owner.id)

    # 1. Create agreement
    res = client.post(
        "/api/v1/agreements",
        headers=headers,
        json={
            "tenancy_id": tenancy.id,
            "tenant_id": tenant.id,
            "template_id": "A",
            "template_name": "Standard Lease",
        },
    )
    assert res.status_code == 201
    ag_data = res.json()
    assert ag_data["status"] == "form_submitted"
    assert ag_data["tracker_stage"] == 1
    ag_id = ag_data["id"]

    # 2. List agreements
    res_list = client.get(f"/api/v1/agreements?tenant_id={tenant.id}", headers=headers)
    assert res_list.status_code == 200
    assert len(res_list.json()) == 1

    res_tenancy = client.get(f"/api/v1/agreements?tenancy_id={tenancy.id}", headers=headers)
    assert res_tenancy.status_code == 200
    assert len(res_tenancy.json()) == 1

    # 3. Get agreement by id
    res_get = client.get(f"/api/v1/agreements/{ag_id}", headers=headers)
    assert res_get.status_code == 200
    assert res_get.json()["id"] == ag_id

    # 4. Update agreement form_data
    res_update = client.patch(
        f"/api/v1/agreements/{ag_id}",
        headers=headers,
        json={"form_data": {"full_name": "Vikram Singh", "identity_number": "123456789012"}},
    )
    assert res_update.status_code == 200
    assert res_update.json()["form_data"]["full_name"] == "Vikram Singh"

    # 5. Compile docx
    res_compile = client.post(f"/api/v1/agreements/{ag_id}/compile-docx", headers=headers)
    assert res_compile.status_code == 200
    assert res_compile.json()["status"] == "docx_generated"
    assert res_compile.json()["tracker_stage"] == 2

    # 6. Add offline upload
    res_upload = client.post(
        f"/api/v1/agreements/{ag_id}/offline-upload",
        headers=headers,
        json={
            "upload_type": "stamp_paper",
            "file_name": "stamp_100.jpg",
            "notes": "Purchased from court",
        },
    )
    assert res_upload.status_code == 201
    upload_id = res_upload.json()["id"]

    # 7. List uploads
    res_uploads = client.get(f"/api/v1/agreements/{ag_id}/uploads", headers=headers)
    assert res_uploads.status_code == 200
    assert len(res_uploads.json()) == 1

    # 8. Update upload status
    res_up_status = client.patch(
        f"/api/v1/agreements/{ag_id}/uploads/{upload_id}",
        headers=headers,
        json={"status": "APPROVED"},
    )
    assert res_up_status.status_code == 200
    assert res_up_status.json()["status"] == "APPROVED"


def test_staff_can_access_and_manage_agreements(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner_staff_ag@example.com")
    create_user(db_session, role_name="staff", email="staff_ag@example.com")
    headers = auth_headers(client, email="staff_ag@example.com")
    tenant, tenancy = _setup_tenancy(db_session, owner.id)

    ag = Agreement(
        tenancy_id=tenancy.id,
        tenant_id=tenant.id,
        template_id="B",
        template_name="Enhanced Agreement",
        status="form_submitted",
        tracker_stage=1,
    )
    db_session.add(ag)
    db_session.commit()

    res = client.get(f"/api/v1/agreements?tenant_id={tenant.id}", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 1

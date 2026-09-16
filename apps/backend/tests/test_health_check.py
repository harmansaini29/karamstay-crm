"""
KaramStay CRM — Full Health-Check Test Suite
=============================================
Covers every new endpoint, role-enforcement rule, edge-case, and security
constraint introduced in the September 2026 feature push.

All tests run against the SQLite in-memory engine wired up in conftest.py.
No real AWS / DB / network needed.
"""

import pytest

from app.features.properties.models import Bed, Property, Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user

# ─── Shared helpers ───────────────────────────────────────────────────────────

def _seed_property_unit(db, owner_id: int, unit_no: str = "101") -> Unit:
    prop = Property(
        owner_id=owner_id,
        name="Karam PG",
        address="MG Road, Jaipur",
        property_type="PG",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db.add(prop)
    db.flush()
    unit = Unit(
        property_id=prop.id,
        unit_no=unit_no,
        unit_type="room",
        rent=10000,
        deposit=10000,
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return unit


def _seed_bed(db, unit_id: int, owner_id: int, bed_no: str = "B1") -> Bed:
    bed = Bed(
        unit_id=unit_id,
        bed_no=bed_no,
        status="vacant",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db.add(bed)
    db.commit()
    db.refresh(bed)
    return bed


class FakeStorage:
    """Minimal stub that satisfies DocumentService without hitting S3."""

    def __init__(self):
        self.deleted = []

    def build_key(self, *, prefix: str, file_name: str) -> str:
        return f"{prefix}/{file_name}"

    def presign_upload(self, *, key: str, content_type: str) -> str:
        return f"https://fake-s3.local/upload/{key}"

    def presign_download(self, *, key: str) -> str:
        return f"https://fake-s3.local/download/{key}"

    def upload_bytes(self, *, key: str, data: bytes, content_type: str) -> None:
        pass

    def delete(self, *, key: str) -> None:
        self.deleted.append(key)


@pytest.fixture()
def fake_storage(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr("app.features.documents.service.get_storage", lambda: storage)
    return storage


# ═══════════════════════════════════════════════════════════════════════════════
# 1. AUTH — Security layer
# ═══════════════════════════════════════════════════════════════════════════════

def test_unauthenticated_request_returns_401(client, db_session):
    """No token -> 401 on every protected endpoint."""
    assert client.get("/api/v1/tenants").status_code == 401
    assert client.get("/api/v1/properties").status_code == 401
    assert client.get("/api/v1/documents").status_code == 401
    assert client.get("/api/v1/maintenance-tickets").status_code == 401


def test_tampered_jwt_rejected(client, db_session):
    """Malformed / tampered bearer token must yield 401."""
    headers = {"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.FAKE.SIGNATURE"}
    assert client.get("/api/v1/tenants", headers=headers).status_code == 401


def test_inactive_user_cannot_login(client, db_session):
    """Deactivated account is refused login."""
    create_user(db_session, role_name="owner", email="inactive@example.com", is_active=False)
    resp = client.post("/api/v1/auth/login", json={"email": "inactive@example.com", "password": "Passw0rd!123"})
    assert resp.status_code in (401, 403)


def test_refresh_token_returns_new_access_token(client, db_session):
    """A valid refresh token must return a new access_token."""
    create_user(db_session, role_name="owner", email="refresh@example.com")
    login = client.post("/api/v1/auth/login", json={"email": "refresh@example.com", "password": "Passw0rd!123"})
    refresh_token = login.json()["refresh_token"]
    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert resp.json().get("access_token")


# ═══════════════════════════════════════════════════════════════════════════════
# 2. ROLE-BASED ACCESS CONTROL
# ═══════════════════════════════════════════════════════════════════════════════

def test_tenant_cannot_list_tenants(client, db_session):
    create_user(db_session, role_name="tenant", email="tenant-list@example.com", phone="+919100000001")
    h = auth_headers(client, email="tenant-list@example.com")
    assert client.get("/api/v1/tenants", headers=h).status_code == 403


def test_staff_can_list_tenants(client, db_session):
    """Staff role was added to the allow-list for GET /tenants."""
    owner = create_user(db_session, role_name="owner", email="owner-staff1@example.com")
    _seed_property_unit(db_session, owner.id)
    create_user(db_session, role_name="staff", email="staff1@example.com", phone="+919100000002")
    h = auth_headers(client, email="staff1@example.com")
    assert client.get("/api/v1/tenants", headers=h).status_code == 200


def test_staff_can_create_tenant(client, db_session):
    create_user(db_session, role_name="staff", email="staff-create@example.com", phone="+919100000010")
    h = auth_headers(client, email="staff-create@example.com")
    resp = client.post(
        "/api/v1/tenants",
        headers=h,
        json={"name": "Staff Tenant", "phone": "+919100000099"},
    )
    assert resp.status_code == 201


def test_staff_can_list_tenancies(client, db_session):
    create_user(db_session, role_name="staff", email="staff-tenancies@example.com", phone="+919100000011")
    h = auth_headers(client, email="staff-tenancies@example.com")
    assert client.get("/api/v1/tenancies", headers=h).status_code == 200


def test_accountant_cannot_delete_tenant(client, db_session):
    """Accountant is not in the allowed roles for DELETE /tenants/{id}."""
    owner = create_user(db_session, role_name="owner", email="owner-acct@example.com")
    _seed_property_unit(db_session, owner.id, unit_no="201")
    owner_h = auth_headers(client, email="owner-acct@example.com")
    tenant = client.post(
        "/api/v1/tenants",
        headers=owner_h,
        json={"name": "Del Tenant", "phone": "+919100000020"},
    ).json()

    create_user(db_session, role_name="accountant", email="acct@example.com", phone="+919100000021")
    acct_h = auth_headers(client, email="acct@example.com")
    resp = client.delete(f"/api/v1/tenants/{tenant['id']}", headers=acct_h)
    assert resp.status_code == 403


def test_manager_cannot_update_rent(client, db_session):
    """Rent update is owner-only."""
    owner = create_user(db_session, role_name="owner", email="owner-mgr-rent@example.com")
    unit = _seed_property_unit(db_session, owner.id, unit_no="202")
    owner_h = auth_headers(client, email="owner-mgr-rent@example.com")
    tenant = client.post(
        "/api/v1/tenants",
        headers=owner_h,
        json={"name": "Rent Tenant", "phone": "+919100000022"},
    ).json()
    tenancy = client.post(
        "/api/v1/tenancies",
        headers=owner_h,
        json={
            "tenant_id": tenant["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "10000.00",
            "security_deposit": "10000.00",
        },
    ).json()

    create_user(db_session, role_name="manager", email="mgr@example.com", phone="+919100000023")
    mgr_h = auth_headers(client, email="mgr@example.com")
    resp = client.patch(
        f"/api/v1/tenancies/{tenancy['id']}/rent",
        headers=mgr_h,
        json={"monthly_rent": "8000.00"},
    )
    assert resp.status_code == 403


def test_tenant_cannot_delete_document(client, db_session, fake_storage):
    """Only owner can DELETE /documents/{id}."""
    owner = create_user(db_session, role_name="owner", email="owner-doc-del@example.com")
    owner_h = auth_headers(client, email="owner-doc-del@example.com")
    tenant_row = Tenant(name="Doc Tenant", phone="+919100000030")
    db_session.add(tenant_row)
    db_session.commit()
    db_session.refresh(tenant_row)

    doc = client.post(
        "/api/v1/documents",
        headers=owner_h,
        json={
            "document_type": "kyc_aadhaar",
            "file_key": "documents/tenant-x/id.pdf",
            "file_name": "id.pdf",
            "content_type": "application/pdf",
            "tenant_id": tenant_row.id,
        },
    ).json()

    tenant_user = create_user(
        db_session,
        role_name="tenant",
        email="tenant-doc-del@example.com",
        phone="+919100000031",
    )
    tenant_row.user_id = tenant_user.id
    db_session.commit()
    tenant_h = auth_headers(client, email="tenant-doc-del@example.com")
    assert client.delete(f"/api/v1/documents/{doc['id']}", headers=tenant_h).status_code == 403
    assert owner is not None


# ═══════════════════════════════════════════════════════════════════════════════
# 3. TENANT SOFT-DELETE
# ═══════════════════════════════════════════════════════════════════════════════

def test_owner_can_soft_delete_tenant(client, db_session):
    create_user(db_session, role_name="owner", email="owner-del1@example.com")
    h = auth_headers(client, email="owner-del1@example.com")
    tenant = client.post(
        "/api/v1/tenants",
        headers=h,
        json={"name": "Delete Me", "phone": "+919200000001"},
    ).json()

    resp = client.delete(f"/api/v1/tenants/{tenant['id']}", headers=h)
    assert resp.status_code == 204


def test_soft_delete_tenant_with_active_tenancy_vacates_beds(client, db_session):
    """Deleting a tenant who has an active tenancy must auto-complete that tenancy."""
    owner = create_user(db_session, role_name="owner", email="owner-del2@example.com")
    h = auth_headers(client, email="owner-del2@example.com")
    unit = _seed_property_unit(db_session, owner.id, unit_no="301")
    bed = _seed_bed(db_session, unit.id, owner.id, bed_no="B1")

    tenant = client.post(
        "/api/v1/tenants",
        headers=h,
        json={"name": "Vacate Tenant", "phone": "+919200000002"},
    ).json()
    client.post(
        "/api/v1/tenancies",
        headers=h,
        json={
            "tenant_id": tenant["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "10000.00",
            "security_deposit": "10000.00",
            "bed_ids": [bed.id],
        },
    )

    resp = client.delete(f"/api/v1/tenants/{tenant['id']}", headers=h)
    assert resp.status_code == 204

    db_session.refresh(bed)
    assert bed.status == "vacant"


def test_soft_delete_nonexistent_tenant_returns_404(client, db_session):
    create_user(db_session, role_name="owner", email="owner-del3@example.com")
    h = auth_headers(client, email="owner-del3@example.com")
    assert client.delete("/api/v1/tenants/999999", headers=h).status_code == 404


def test_deleted_tenant_not_in_list(client, db_session):
    """After soft-delete the tenant must NOT appear in list_tenants."""
    create_user(db_session, role_name="owner", email="owner-del4@example.com")
    h = auth_headers(client, email="owner-del4@example.com")
    tenant = client.post(
        "/api/v1/tenants",
        headers=h,
        json={"name": "Ghost", "phone": "+919200000003"},
    ).json()
    client.delete(f"/api/v1/tenants/{tenant['id']}", headers=h)

    listing = client.get("/api/v1/tenants", headers=h).json()
    ids = [t["id"] for t in listing]
    assert tenant["id"] not in ids


# ═══════════════════════════════════════════════════════════════════════════════
# 4. RENT UPDATE
# ═══════════════════════════════════════════════════════════════════════════════

def test_owner_can_update_rent(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-rent1@example.com")
    h = auth_headers(client, email="owner-rent1@example.com")
    unit = _seed_property_unit(db_session, owner.id, unit_no="401")
    tenant = client.post(
        "/api/v1/tenants",
        headers=h,
        json={"name": "Rent Tenant", "phone": "+919300000001"},
    ).json()
    tenancy = client.post(
        "/api/v1/tenancies",
        headers=h,
        json={
            "tenant_id": tenant["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "10000.00",
            "security_deposit": "10000.00",
        },
    ).json()

    resp = client.patch(
        f"/api/v1/tenancies/{tenancy['id']}/rent",
        headers=h,
        json={"monthly_rent": "12000.00"},
    )
    assert resp.status_code == 200
    assert resp.json()["monthly_rent"] == "12000.00"


def test_rent_update_negative_value_rejected(client, db_session):
    """Pydantic schema must reject negative rent."""
    owner = create_user(db_session, role_name="owner", email="owner-rent2@example.com")
    h = auth_headers(client, email="owner-rent2@example.com")
    unit = _seed_property_unit(db_session, owner.id, unit_no="402")
    tenant = client.post(
        "/api/v1/tenants",
        headers=h,
        json={"name": "Neg Rent", "phone": "+919300000002"},
    ).json()
    tenancy = client.post(
        "/api/v1/tenancies",
        headers=h,
        json={
            "tenant_id": tenant["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "10000.00",
            "security_deposit": "10000.00",
        },
    ).json()

    resp = client.patch(
        f"/api/v1/tenancies/{tenancy['id']}/rent",
        headers=h,
        json={"monthly_rent": "-500.00"},
    )
    assert resp.status_code == 422


def test_rent_update_nonexistent_tenancy_returns_404(client, db_session):
    create_user(db_session, role_name="owner", email="owner-rent3@example.com")
    h = auth_headers(client, email="owner-rent3@example.com")
    resp = client.patch(
        "/api/v1/tenancies/999999/rent",
        headers=h,
        json={"monthly_rent": "5000.00"},
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# 5. DOCUMENT DELETE
# ═══════════════════════════════════════════════════════════════════════════════

def test_owner_can_delete_document_soft(client, db_session, fake_storage):
    create_user(db_session, role_name="owner", email="owner-doc1@example.com")
    h = auth_headers(client, email="owner-doc1@example.com")
    tenant_row = Tenant(name="Doc Person", phone="+919400000001")
    db_session.add(tenant_row)
    db_session.commit()
    db_session.refresh(tenant_row)

    doc = client.post(
        "/api/v1/documents",
        headers=h,
        json={
            "document_type": "kyc_aadhaar",
            "file_key": "documents/tenant-1/aadhar.pdf",
            "file_name": "aadhar.pdf",
            "content_type": "application/pdf",
            "tenant_id": tenant_row.id,
        },
    ).json()

    resp = client.delete(f"/api/v1/documents/{doc['id']}", headers=h)
    assert resp.status_code == 204
    listing = client.get("/api/v1/documents", headers=h).json()
    assert not any(d["id"] == doc["id"] for d in listing)


def test_delete_nonexistent_document_returns_404(client, db_session, fake_storage):
    create_user(db_session, role_name="owner", email="owner-doc2@example.com")
    h = auth_headers(client, email="owner-doc2@example.com")
    assert client.delete("/api/v1/documents/999999", headers=h).status_code == 404


def test_staff_can_upload_document(client, db_session, fake_storage):
    """Staff must be allowed to presign-upload and create documents."""
    owner = create_user(db_session, role_name="owner", email="owner-doc3@example.com")
    create_user(db_session, role_name="staff", email="staff-doc@example.com", phone="+919400000010")
    h = auth_headers(client, email="staff-doc@example.com")
    tenant_row = Tenant(name="Staff Upload Tenant", phone="+919400000011")
    db_session.add(tenant_row)
    db_session.commit()
    db_session.refresh(tenant_row)

    presign = client.post(
        "/api/v1/documents/presign-upload",
        headers=h,
        json={
            "document_type": "kyc_aadhaar",
            "file_name": "aadhaar.pdf",
            "content_type": "application/pdf",
            "tenant_id": tenant_row.id,
        },
    )
    assert presign.status_code == 200
    assert owner is not None


# ═══════════════════════════════════════════════════════════════════════════════
# 6. MAINTENANCE TICKETS — Staff access
# ═══════════════════════════════════════════════════════════════════════════════

def test_staff_can_create_maintenance_ticket(client, db_session):
    """Staff must be able to raise a ticket on any unit (they manage the PG)."""
    owner = create_user(db_session, role_name="owner", email="owner-maint@example.com")
    unit = _seed_property_unit(db_session, owner.id, unit_no="501")
    create_user(db_session, role_name="staff", email="staff-maint@example.com", phone="+919500000001")
    h = auth_headers(client, email="staff-maint@example.com")

    resp = client.post(
        "/api/v1/maintenance-tickets",
        headers=h,
        json={
            "unit_id": unit.id,
            "category": "Plumbing",
            "description": "Tap leaking in common bathroom",
            "priority": "high",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "open"


def test_maintenance_ticket_missing_description_rejected(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-maint2@example.com")
    unit = _seed_property_unit(db_session, owner.id, unit_no="502")
    h = auth_headers(client, email="owner-maint2@example.com")

    resp = client.post(
        "/api/v1/maintenance-tickets",
        headers=h,
        json={"unit_id": unit.id, "category": "Electrical"},
    )
    assert resp.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════════
# 7. TENANT SCHEMA — DOB & empty-string sanitization
# ═══════════════════════════════════════════════════════════════════════════════

def test_create_tenant_with_empty_string_fields_normalised(client, db_session):
    """Empty-string optional fields must be stored as None, not empty strings."""
    create_user(db_session, role_name="owner", email="owner-schema1@example.com")
    h = auth_headers(client, email="owner-schema1@example.com")

    resp = client.post(
        "/api/v1/tenants",
        headers=h,
        json={
            "name": "Schema Test",
            "phone": "+919600000001",
            "email": "",
            "occupation": "   ",
            "emergency_contact_name": "",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] is None
    assert body["occupation"] is None
    assert body["emergency_contact_name"] is None


def test_create_tenant_dob_string_formats(client, db_session):
    """All supported DOB string formats must be accepted."""
    create_user(db_session, role_name="owner", email="owner-schema2@example.com")
    h = auth_headers(client, email="owner-schema2@example.com")

    for i, dob_str in enumerate(["1990-01-15", "15/01/1990", "15-01-1990", "15.01.1990"]):
        resp = client.post(
            "/api/v1/tenants",
            headers=h,
            json={"name": f"DOB Test {i}", "phone": f"+91960000{i:04d}", "date_of_birth": dob_str},
        )
        assert resp.status_code == 201, f"DOB format {dob_str!r} failed: {resp.text}"


def test_create_tenant_name_too_short_rejected(client, db_session):
    create_user(db_session, role_name="owner", email="owner-schema3@example.com")
    h = auth_headers(client, email="owner-schema3@example.com")
    resp = client.post(
        "/api/v1/tenants",
        headers=h,
        json={"name": "X", "phone": "+919600000020"},
    )
    assert resp.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════════
# 8. TENANCY BED-SYNC (bed assign via API)
# ═══════════════════════════════════════════════════════════════════════════════

def test_assign_bed_creates_tenancy_and_syncs_tenant_status(client, db_session):
    """
    When a bed is assigned via POST /units/{id}/beds/assign with tenant_id,
    an active Tenancy row must be created and the tenant status set to active.
    """
    from sqlalchemy import select as sa_select

    owner = create_user(db_session, role_name="owner", email="owner-sync1@example.com")
    h = auth_headers(client, email="owner-sync1@example.com")
    unit = _seed_property_unit(db_session, owner.id, unit_no="601")
    bed = _seed_bed(db_session, unit.id, owner.id, bed_no="Bed-1")

    tenant = client.post(
        "/api/v1/tenants",
        headers=h,
        json={"name": "Sync Tenant", "phone": "+919700000001"},
    ).json()

    resp = client.post(
        f"/api/v1/units/{unit.id}/beds/assign",
        headers=h,
        json={"bed_ids": [bed.id], "tenant_id": tenant["id"]},
    )
    assert resp.status_code == 200

    tenancy = db_session.scalar(
        sa_select(Tenancy).where(
            Tenancy.tenant_id == tenant["id"],
            Tenancy.status == "active",
        )
    )
    assert tenancy is not None, "Tenancy row was not auto-created on bed assign"

    tenant_row = db_session.get(Tenant, tenant["id"])
    assert tenant_row.status == "active"


def test_vacate_bed_completes_tenancy(client, db_session):
    """Vacating a bed must mark the bed vacant and remove the active tenancy."""
    from sqlalchemy import select as sa_select

    owner = create_user(db_session, role_name="owner", email="owner-sync2@example.com")
    h = auth_headers(client, email="owner-sync2@example.com")
    unit = _seed_property_unit(db_session, owner.id, unit_no="602")
    bed = _seed_bed(db_session, unit.id, owner.id, bed_no="Bed-2")

    tenant = client.post(
        "/api/v1/tenants",
        headers=h,
        json={"name": "Vacate Sync", "phone": "+919700000002"},
    ).json()

    client.post(
        f"/api/v1/units/{unit.id}/beds/assign",
        headers=h,
        json={"bed_ids": [bed.id], "tenant_id": tenant["id"]},
    )

    resp = client.post(
        f"/api/v1/units/{unit.id}/beds/vacate",
        headers=h,
        json={"bed_ids": [bed.id]},
    )
    assert resp.status_code == 200

    db_session.refresh(bed)
    assert bed.status == "vacant"

    active = db_session.scalar(
        sa_select(Tenancy).where(
            Tenancy.tenant_id == tenant["id"],
            Tenancy.status == "active",
        )
    )
    assert active is None, "Tenancy should not remain active after bed vacate"


# ═══════════════════════════════════════════════════════════════════════════════
# 9. TENANT DETAIL — staff read access
# ═══════════════════════════════════════════════════════════════════════════════

def test_staff_can_read_tenant_profile(client, db_session):
    create_user(db_session, role_name="owner", email="owner-staff-read@example.com")
    owner_h = auth_headers(client, email="owner-staff-read@example.com")
    tenant = client.post(
        "/api/v1/tenants",
        headers=owner_h,
        json={"name": "Read Me", "phone": "+919800000001"},
    ).json()

    create_user(db_session, role_name="staff", email="staff-read@example.com", phone="+919800000002")
    staff_h = auth_headers(client, email="staff-read@example.com")
    resp = client.get(f"/api/v1/tenants/{tenant['id']}", headers=staff_h)
    assert resp.status_code == 200
    assert resp.json()["id"] == tenant["id"]


def test_staff_cannot_delete_tenant(client, db_session):
    create_user(db_session, role_name="owner", email="owner-staffdel@example.com")
    owner_h = auth_headers(client, email="owner-staffdel@example.com")
    tenant = client.post(
        "/api/v1/tenants",
        headers=owner_h,
        json={"name": "No Del Staff", "phone": "+919800000010"},
    ).json()

    create_user(db_session, role_name="staff", email="staff-del@example.com", phone="+919800000011")
    staff_h = auth_headers(client, email="staff-del@example.com")
    resp = client.delete(f"/api/v1/tenants/{tenant['id']}", headers=staff_h)
    assert resp.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════════
# 10. ANALYTICS — occupancy sanity
# ═══════════════════════════════════════════════════════════════════════════════

def test_dashboard_occupancy_is_a_fraction_not_percentage(client, db_session):
    """
    Occupancy must be a ratio 0-1, never exceed 1.0 (100 %).
    """
    create_user(db_session, role_name="owner", email="owner-occ@example.com")
    h = auth_headers(client, email="owner-occ@example.com")

    resp = client.get("/api/v1/analytics/dashboard", headers=h)
    assert resp.status_code == 200
    body = resp.json()
    occupancy = body.get("occupancy_rate", 0)
    assert 0 <= occupancy <= 1, f"Occupancy out of range: {occupancy}"


# ═══════════════════════════════════════════════════════════════════════════════
# 11. PROPERTY / UNIT ENDPOINTS — staff access
# ═══════════════════════════════════════════════════════════════════════════════

def test_staff_can_list_properties(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-prop-staff@example.com")
    _seed_property_unit(db_session, owner.id, unit_no="701")
    create_user(db_session, role_name="staff", email="staff-prop@example.com", phone="+919900000001")
    h = auth_headers(client, email="staff-prop@example.com")
    assert client.get("/api/v1/properties", headers=h).status_code == 200


def test_staff_can_get_unit_detail(client, db_session):
    owner = create_user(db_session, role_name="owner", email="owner-unit-staff@example.com")
    unit = _seed_property_unit(db_session, owner.id, unit_no="702")
    create_user(db_session, role_name="staff", email="staff-unit@example.com", phone="+919900000002")
    h = auth_headers(client, email="staff-unit@example.com")
    assert client.get(f"/api/v1/units/{unit.id}", headers=h).status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# 12. AUDIT LOG TRAIL
# ═══════════════════════════════════════════════════════════════════════════════

def test_soft_delete_writes_audit_log(client, db_session):
    from sqlalchemy import select as sa_select

    from app.features.audit.models import AuditLog

    create_user(db_session, role_name="owner", email="owner-audit1@example.com")
    h = auth_headers(client, email="owner-audit1@example.com")
    tenant = client.post(
        "/api/v1/tenants",
        headers=h,
        json={"name": "Audit Delete", "phone": "+919950000001"},
    ).json()

    client.delete(f"/api/v1/tenants/{tenant['id']}", headers=h)

    actions = list(db_session.scalars(sa_select(AuditLog.action)))
    assert "tenant.soft_delete" in actions


def test_rent_update_writes_audit_log(client, db_session):
    from sqlalchemy import select as sa_select

    from app.features.audit.models import AuditLog

    owner = create_user(db_session, role_name="owner", email="owner-audit2@example.com")
    h = auth_headers(client, email="owner-audit2@example.com")
    unit = _seed_property_unit(db_session, owner.id, unit_no="801")
    tenant = client.post(
        "/api/v1/tenants",
        headers=h,
        json={"name": "Audit Rent", "phone": "+919950000002"},
    ).json()
    tenancy = client.post(
        "/api/v1/tenancies",
        headers=h,
        json={
            "tenant_id": tenant["id"],
            "unit_id": unit.id,
            "start_date": "2026-07-01",
            "monthly_rent": "10000.00",
            "security_deposit": "10000.00",
        },
    ).json()

    client.patch(
        f"/api/v1/tenancies/{tenancy['id']}/rent",
        headers=h,
        json={"monthly_rent": "11000.00"},
    )

    actions = list(db_session.scalars(sa_select(AuditLog.action)))
    assert "tenancy.rent_update" in actions

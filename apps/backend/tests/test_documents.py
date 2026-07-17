import pytest

from app.features.properties.models import Property
from app.features.tenants.models import Tenant
from tests.factories import auth_headers, create_user


class FakeStorage:
    def __init__(self):
        self.uploaded = {}

    def build_key(self, *, prefix: str, file_name: str) -> str:
        return f"{prefix}/{file_name}"

    def presign_upload(self, *, key: str, content_type: str) -> str:
        return f"https://fake-s3.local/upload/{key}?ct={content_type}"

    def presign_download(self, *, key: str) -> str:
        return f"https://fake-s3.local/download/{key}"

    def upload_bytes(self, *, key: str, data: bytes, content_type: str) -> None:
        self.uploaded[key] = data

    def delete(self, *, key: str) -> None:
        self.uploaded.pop(key, None)


@pytest.fixture()
def fake_storage(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr("app.features.documents.service.get_storage", lambda: storage)
    return storage


def _seed_tenant_and_property(db_session, owner_id: int) -> tuple[Tenant, Property]:
    tenant = Tenant(name="Ravi Kumar", phone="+919810000030")
    db_session.add(tenant)
    property_ = Property(
        owner_id=owner_id,
        name="Karam PG",
        address="MG Road",
        property_type="PG",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(property_)
    db_session.commit()
    db_session.refresh(tenant)
    db_session.refresh(property_)
    return tenant, property_


def test_presign_upload_and_create_document(client, db_session, fake_storage):
    owner = create_user(db_session, role_name="owner", email="owner@example.com")
    headers = auth_headers(client, email="owner@example.com")
    tenant, _ = _seed_tenant_and_property(db_session, owner.id)

    presign = client.post(
        "/api/v1/documents/presign-upload",
        headers=headers,
        json={
            "document_type": "kyc_aadhaar",
            "file_name": "aadhaar.pdf",
            "content_type": "application/pdf",
            "tenant_id": tenant.id,
        },
    )
    assert presign.status_code == 200
    file_key = presign.json()["file_key"]
    assert file_key.startswith(f"documents/tenant-{tenant.id}/")

    create_response = client.post(
        "/api/v1/documents",
        headers=headers,
        json={
            "document_type": "kyc_aadhaar",
            "file_key": file_key,
            "file_name": "aadhaar.pdf",
            "content_type": "application/pdf",
            "tenant_id": tenant.id,
        },
    )
    assert create_response.status_code == 201
    assert "file_key" not in create_response.json()


def test_presign_upload_requires_a_target(client, db_session, fake_storage):
    create_user(db_session, role_name="owner", email="owner2@example.com")
    headers = auth_headers(client, email="owner2@example.com")

    response = client.post(
        "/api/v1/documents/presign-upload",
        headers=headers,
        json={"document_type": "misc", "file_name": "a.pdf", "content_type": "application/pdf"},
    )
    assert response.status_code == 422


def test_tenant_can_only_download_own_document(client, db_session, fake_storage):
    owner = create_user(db_session, role_name="owner", email="owner3@example.com")
    owner_headers = auth_headers(client, email="owner3@example.com")
    tenant, _ = _seed_tenant_and_property(db_session, owner.id)

    document_response = client.post(
        "/api/v1/documents",
        headers=owner_headers,
        json={
            "document_type": "agreement",
            "file_key": "documents/tenant-1/agreement.pdf",
            "file_name": "agreement.pdf",
            "content_type": "application/pdf",
            "tenant_id": tenant.id,
        },
    )
    document_id = document_response.json()["id"]

    other_tenant_user = create_user(
        db_session,
        role_name="tenant",
        email="other-tenant@example.com",
        phone="+919810000099",
    )
    tenant_headers = auth_headers(client, email="other-tenant@example.com")

    denied = client.get(f"/api/v1/documents/{document_id}/download", headers=tenant_headers)
    assert denied.status_code == 403

    tenant.user_id = None
    db_session.commit()
    tenant.user_id = create_user(
        db_session,
        role_name="tenant",
        email="tenant-self@example.com",
        phone=tenant.phone + "x",
    ).id
    db_session.commit()

    self_headers = auth_headers(client, email="tenant-self@example.com")
    allowed = client.get(f"/api/v1/documents/{document_id}/download", headers=self_headers)
    assert allowed.status_code == 200
    assert allowed.json()["download_url"].startswith("https://fake-s3.local/download/")
    assert other_tenant_user.id != tenant.user_id


def test_new_document_defaults_to_pending_status(client, db_session, fake_storage):
    owner = create_user(db_session, role_name="owner", email="owner-status1@example.com")
    headers = auth_headers(client, email="owner-status1@example.com")
    tenant, _ = _seed_tenant_and_property(db_session, owner.id)

    created = client.post(
        "/api/v1/documents",
        headers=headers,
        json={
            "document_type": "kyc_aadhaar",
            "file_key": "documents/tenant-1/aadhaar.pdf",
            "file_name": "aadhaar.pdf",
            "content_type": "application/pdf",
            "tenant_id": tenant.id,
        },
    ).json()
    assert created["status"] == "pending"

    fetched = client.get(f"/api/v1/documents/{created['id']}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "pending"


def test_owner_can_approve_and_reject_document_status(client, db_session, fake_storage):
    owner = create_user(db_session, role_name="owner", email="owner-status2@example.com")
    headers = auth_headers(client, email="owner-status2@example.com")
    tenant, _ = _seed_tenant_and_property(db_session, owner.id)

    document = client.post(
        "/api/v1/documents",
        headers=headers,
        json={
            "document_type": "kyc_aadhaar",
            "file_key": "documents/tenant-1/aadhaar.pdf",
            "file_name": "aadhaar.pdf",
            "content_type": "application/pdf",
            "tenant_id": tenant.id,
        },
    ).json()

    approved = client.patch(
        f"/api/v1/documents/{document['id']}/status",
        headers=headers,
        json={"status": "approved"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["rejection_reason"] is None

    rejected = client.patch(
        f"/api/v1/documents/{document['id']}/status",
        headers=headers,
        json={"status": "rejected", "rejection_reason": "Blurry photo"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["rejection_reason"] == "Blurry photo"


def test_rejecting_document_without_reason_is_rejected(client, db_session, fake_storage):
    owner = create_user(db_session, role_name="owner", email="owner-status3@example.com")
    headers = auth_headers(client, email="owner-status3@example.com")
    tenant, _ = _seed_tenant_and_property(db_session, owner.id)

    document = client.post(
        "/api/v1/documents",
        headers=headers,
        json={
            "document_type": "kyc_aadhaar",
            "file_key": "documents/tenant-1/aadhaar.pdf",
            "file_name": "aadhaar.pdf",
            "content_type": "application/pdf",
            "tenant_id": tenant.id,
        },
    ).json()

    response = client.patch(
        f"/api/v1/documents/{document['id']}/status",
        headers=headers,
        json={"status": "rejected"},
    )
    assert response.status_code == 422


def test_tenant_cannot_update_document_status(client, db_session, fake_storage):
    owner = create_user(db_session, role_name="owner", email="owner-status4@example.com")
    owner_headers = auth_headers(client, email="owner-status4@example.com")
    tenant, _ = _seed_tenant_and_property(db_session, owner.id)

    document = client.post(
        "/api/v1/documents",
        headers=owner_headers,
        json={
            "document_type": "agreement",
            "file_key": "documents/tenant-1/agreement.pdf",
            "file_name": "agreement.pdf",
            "content_type": "application/pdf",
            "tenant_id": tenant.id,
        },
    ).json()

    tenant.user_id = create_user(
        db_session,
        role_name="tenant",
        email="tenant-status@example.com",
        phone=tenant.phone + "y",
    ).id
    db_session.commit()
    tenant_headers = auth_headers(client, email="tenant-status@example.com")

    response = client.patch(
        f"/api/v1/documents/{document['id']}/status",
        headers=tenant_headers,
        json={"status": "approved"},
    )
    assert response.status_code == 403


def test_owner_can_list_all_documents(client, db_session, fake_storage):
    owner = create_user(db_session, role_name="owner", email="owner4@example.com")
    headers = auth_headers(client, email="owner4@example.com")
    _, property_ = _seed_tenant_and_property(db_session, owner.id)

    client.post(
        "/api/v1/documents",
        headers=headers,
        json={
            "document_type": "ownership_proof",
            "file_key": "documents/property-1/deed.pdf",
            "file_name": "deed.pdf",
            "content_type": "application/pdf",
            "property_id": property_.id,
        },
    )

    listing = client.get("/api/v1/documents", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1

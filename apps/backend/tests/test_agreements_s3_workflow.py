from datetime import date
from decimal import Decimal

from app.core.storage import get_storage
from app.features.agreements.models import Agreement
from app.features.documents.models import Document
from app.features.notifications.models import Notification
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant
from tests.factories import auth_headers, create_user

# 1x1 transparent PNG in base64
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
# 1x1 JPEG in base64
TINY_JPEG_B64 = (
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP///////////////////////////////////"
    "///////////////////////////////////////////////////"
    "wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
)


def _setup_full_tenant(db_session, owner_id: int, tenant_user_id: int) -> tuple[Property, Unit, Tenant, Tenancy]:
    prop = Property(
        owner_id=owner_id,
        name="Karam Residency South",
        address="Cyber City, Gurgaon",
        property_type="Apartment",
        payment_upi_id="karamsouth@okhdfcbank",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(prop)
    db_session.flush()

    unit = Unit(
        property_id=prop.id,
        unit_no="102",
        unit_type="Studio",
        rent=18000,
        deposit=18000,
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(
        name="Deepak Chopra",
        phone="+919876543210",
        user_id=tenant_user_id,
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(tenant)
    db_session.flush()

    tenancy = Tenancy(
        tenant_id=tenant.id,
        unit_id=unit.id,
        start_date=date(2026, 9, 1),
        monthly_rent=Decimal("18000.00"),
        security_deposit=Decimal("18000.00"),
        status="active",
        created_by_id=owner_id,
        updated_by_id=owner_id,
    )
    db_session.add(tenancy)
    db_session.commit()
    return prop, unit, tenant, tenancy


def test_agreement_kyc_submission_docx_compilation_and_s3_archival(client, db_session):
    storage = get_storage()
    owner = create_user(db_session, role_name="owner", email="owner_arch@example.com")
    tenant_user = create_user(db_session, role_name="tenant", email="tenant_arch@example.com")
    owner_headers = auth_headers(client, email="owner_arch@example.com")
    tenant_headers = auth_headers(client, email="tenant_arch@example.com")

    prop, unit, tenant, tenancy = _setup_full_tenant(db_session, owner.id, tenant_user.id)

    # 1. Owner creates agreement
    res_create = client.post(
        "/api/v1/agreements",
        headers=owner_headers,
        json={
            "tenancy_id": tenancy.id,
            "tenant_id": tenant.id,
            "template_id": "A",
            "template_name": "Standard Lease Agreement",
        },
    )
    assert res_create.status_code == 201
    ag_id = res_create.json()["id"]

    # 2. Tenant submits KYC documents (photo, Aadhaar, signature)
    res_kyc = client.post(
        f"/api/v1/agreements/{ag_id}/submit-kyc",
        headers=tenant_headers,
        json={
            "form_data": {
                "full_name": "Deepak Chopra",
                "identity_number": "999988887777",
                "phone": "+919876543210",
                "emergency_contact": "Father - 9876500000",
                "permanent_address": "Flat 2, Green Park, Delhi",
            },
            "tenant_photo_base64": TINY_JPEG_B64,
            "aadhar_card_base64": TINY_JPEG_B64,
            "signature_base64": TINY_PNG_B64,
        },
    )
    assert res_kyc.status_code == 200
    kyc_data = res_kyc.json()
    assert kyc_data["status"] == "docx_generated"
    assert kyc_data["tracker_stage"] == 2
    assert kyc_data["tenant_photo_key"] is not None
    assert kyc_data["aadhar_card_key"] is not None
    assert kyc_data["signature_key"] is not None
    assert kyc_data["docx_file_name"] is not None
    assert kyc_data["tenant_photo_url"] is not None
    assert kyc_data["docx_download_url"] is not None
    assert kyc_data["pdf_download_url"] is not None

    # Check files exist in storage
    assert storage.object_exists(key=kyc_data["tenant_photo_key"])
    assert storage.object_exists(key=f"agreements/ag_{ag_id}_A.docx")
    assert storage.object_exists(key=f"agreements/ag_{ag_id}_A.pdf")

    # Check staff in-app notification created
    notif = db_session.query(Notification).filter(
        Notification.notification_type == "tenant_agreement_submitted"
    ).first()
    assert notif is not None
    assert "Deepak Chopra" in notif.message

    # 3. Download endpoints
    res_dl_docx = client.get(f"/api/v1/agreements/{ag_id}/download?doc_type=docx", headers=owner_headers)
    assert res_dl_docx.status_code == 200
    assert "download_url" in res_dl_docx.json()

    res_dl_pdf = client.get(f"/api/v1/agreements/{ag_id}/download?doc_type=pdf", headers=owner_headers)
    assert res_dl_pdf.status_code == 200
    assert "download_url" in res_dl_pdf.json()

    # 4. Add offline document (Stamp Paper)
    res_off = client.post(
        f"/api/v1/agreements/{ag_id}/offline-upload",
        headers=owner_headers,
        json={
            "upload_type": "stamp_paper",
            "file_name": "stamp_paper_500.jpg",
            "notes": "E-Stamp Paper Rs 500",
            "file_base64": TINY_JPEG_B64,
        },
    )
    assert res_off.status_code == 201
    off_data = res_off.json()
    assert off_data["status"] == "PENDING"
    assert off_data["file_url"] is not None

    # 5. Owner approves and archives into AWS S3 Vault
    res_approve = client.post(f"/api/v1/agreements/{ag_id}/approve-and-archive", headers=owner_headers)
    assert res_approve.status_code == 200
    app_data = res_approve.json()
    assert "tenants/Deepak_Chopra" in app_data["s3_folder_path"]
    assert "Room_102" in app_data["s3_folder_path"]
    assert len(app_data["archived_files"]) >= 4

    # Assert documents are now in Legal Vault (documents table) with status=approved
    docs = db_session.query(Document).filter(Document.tenant_id == tenant.id).all()
    assert len(docs) >= 4
    for d in docs:
        assert d.status == "approved"

    # Assert tenant notification created
    tenant_notif = db_session.query(Notification).filter(
        Notification.user_id == tenant_user.id,
        Notification.notification_type == "agreement_approved",
    ).first()
    assert tenant_notif is not None


def test_vault_portal_and_api(client, db_session):
    create_user(db_session, role_name="owner", email="owner_v@example.com")
    headers = auth_headers(client, email="owner_v@example.com")

    # 1. Access portal HTML
    res_html = client.get("/api/v1/vault/portal")
    assert res_html.status_code == 200
    assert "KaramStay Secure Vault" in res_html.text

    # 2. Get tree
    res_tree = client.get("/api/v1/vault/tree", headers=headers)
    assert res_tree.status_code == 200
    assert "folders" in res_tree.json()

    # 3. Direct upload to vault
    res_up = client.post(
        "/api/v1/vault/upload",
        headers=headers,
        json={
            "folder": "tenants/Test_Tenant_99/Room_303",
            "file_name": "id_proof.jpg",
            "file_base64": TINY_JPEG_B64,
            "content_type": "image/jpeg",
        },
    )
    assert res_up.status_code == 200
    assert res_up.json()["success"] is True

    # 4. Generate PDF from images
    res_pdf = client.post(
        "/api/v1/vault/generate-pdf",
        headers=headers,
        json={
            "image_keys": ["tenants/Test_Tenant_99/Room_303/id_proof.jpg"],
            "output_folder": "tenants/Test_Tenant_99/Room_303",
            "title": "Compiled Identity Documents",
        },
    )
    assert res_pdf.status_code == 200
    assert res_pdf.json()["success"] is True
    assert res_pdf.json()["download_url"] is not None

    # 5. Generate Docx from images
    res_docx = client.post(
        "/api/v1/vault/generate-docx",
        headers=headers,
        json={
            "image_keys": ["tenants/Test_Tenant_99/Room_303/id_proof.jpg"],
            "output_folder": "tenants/Test_Tenant_99/Room_303",
            "title": "Compiled Identity Documents",
        },
    )
    assert res_docx.status_code == 200
    assert res_docx.json()["success"] is True
    assert res_docx.json()["download_url"] is not None


def test_agreement_auto_initialization_on_check_in_and_tenant_fetch(client, db_session):
    """Test that check_in automatically initializes agreement and tenant GET /agreements auto-syncs."""
    owner = create_user(db_session, role_name="owner", email="owner_auto@example.com")
    tenant_user = create_user(db_session, role_name="tenant", email="tenant_auto@example.com")
    owner_headers = auth_headers(client, email="owner_auto@example.com")
    tenant_headers = auth_headers(client, email="tenant_auto@example.com")

    # 1. Create property and unit
    res_p = client.post(
        "/api/v1/properties",
        headers=owner_headers,
        json={
            "name": "Auto Sync Residency",
            "address": "Indiranagar, Bangalore",
            "property_type": "PG",
            "payment_upi_id": "autosync@upi",
        },
    )
    prop_id = res_p.json()["id"]

    unit = Unit(
        property_id=prop_id,
        unit_no="301",
        unit_type="Single",
        rent=10000,
        deposit=10000,
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    db_session.add(unit)
    db_session.flush()

    tenant = Tenant(
        name="Auto Tenant",
        phone="+919999888877",
        user_id=tenant_user.id,
        created_by_id=owner.id,
        updated_by_id=owner.id,
    )
    db_session.add(tenant)
    db_session.commit()

    # 2. Check in via API
    res_ci = client.post(
        "/api/v1/tenancies",
        headers=owner_headers,
        json={
            "tenant_id": tenant.id,
            "unit_id": unit.id,
            "start_date": "2026-10-01",
            "monthly_rent": 10000.0,
            "security_deposit": 10000.0,
            "billing_day": 1,
        },
    )
    assert res_ci.status_code == 201

    # Assert agreement was automatically initialized in database
    ag = db_session.query(Agreement).filter(Agreement.tenant_id == tenant.id).first()
    assert ag is not None
    assert ag.tracker_stage == 1
    assert ag.status == "form_submitted"

    # 3. Tenant queries /api/v1/agreements and gets it immediately
    res_ag = client.get("/api/v1/agreements", headers=tenant_headers)
    assert res_ag.status_code == 200
    ags = res_ag.json()
    assert len(ags) == 1
    assert ags[0]["id"] == ag.id
    assert ags[0]["tracker_stage"] == 1


def test_sms_otp_gateway_dispatch(client, db_session, monkeypatch):
    """Test OTP request falls back to SMS when configured."""
    owner = create_user(db_session, role_name="owner", email="owner_sms@example.com")
    tenant = Tenant(name="SMS Tenant", phone="+919123456780", created_by_id=owner.id, updated_by_id=owner.id)
    db_session.add(tenant)
    db_session.commit()

    from app.core.config import settings
    monkeypatch.setattr(settings, "whatsapp_cloud_api_token", None)
    monkeypatch.setattr(settings, "fast2sms_api_key", "mock_key_test")

    sms_sent = []

    def mock_send_sms(*, to, message):
        sms_sent.append((to, message))
        return {"status": "sent", "provider": "mock"}

    import app.features.auth.service as auth_svc
    monkeypatch.setattr(auth_svc, "send_sms", mock_send_sms)

    res = client.post("/api/v1/auth/otp/request", json={"phone": "+919123456780"})
    assert res.status_code == 200
    assert len(sms_sent) == 1
    assert sms_sent[0][0] == "+919123456780"
    assert "verification OTP code is" in sms_sent[0][1]


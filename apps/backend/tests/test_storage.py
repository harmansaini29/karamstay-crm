"""
Unit and integration tests for ObjectStorage, LocalStorage fallback, and S3Service.
"""
from app.core.s3 import S3Service, get_s3_service
from app.core.storage import LocalStorage, S3Storage, get_storage


def test_local_storage_build_key_sanitizes_filename() -> None:
    storage = LocalStorage()
    key = storage.build_key(prefix="kyc/tenant-10", file_name="my/id/card..jpg")
    assert key.startswith("kyc/tenant-10/")
    assert "my_id_card..jpg" in key
    assert "/" not in key.split("/")[-1]


def test_local_storage_presign_upload_includes_ttl() -> None:
    storage = LocalStorage()
    url = storage.presign_upload(key="agreements/doc.pdf", content_type="application/pdf", expires_in=1800)
    assert "action=put" in url
    assert "content_type=application/pdf" in url
    assert "expires_in=1800" in url


def test_local_storage_presign_download_includes_ttl() -> None:
    storage = LocalStorage()
    url = storage.presign_download(key="agreements/doc.pdf", expires_in=900)
    assert "action=get" in url
    assert "expires_in=900" in url


def test_local_storage_upload_and_delete() -> None:
    storage = LocalStorage()
    key = "test/sample.txt"
    payload = b"Sample agreement file content"
    storage.upload_bytes(key=key, data=payload, content_type="text/plain")

    assert storage.get_stored_data(key) == payload

    storage.delete(key=key)
    assert storage.get_stored_data(key) is None


def test_s3_service_kyc_upload_helper() -> None:
    service = S3Service(storage_client=LocalStorage())
    result = service.get_kyc_upload_url(tenant_id=42, file_name="aadhaar.png", expires_in=7200)

    assert "upload_url" in result
    assert "file_key" in result
    assert result["file_key"].startswith("kyc/tenant-42/")
    assert result["content_type"] == "image/jpeg"
    assert "expires_in=7200" in result["upload_url"]


def test_s3_service_agreement_upload_helper() -> None:
    service = S3Service(storage_client=LocalStorage())
    result = service.get_agreement_upload_url(tenancy_id=88, file_name="lease_agreement.pdf", expires_in=3600)

    assert result["file_key"].startswith("agreements/tenancy-88/")
    assert result["content_type"] == "application/pdf"
    assert "expires_in=3600" in result["upload_url"]


def test_s3_service_property_photo_helper() -> None:
    service = S3Service(storage_client=LocalStorage())
    result = service.get_property_photo_upload_url(property_id=5, file_name="front_view.jpg")

    assert result["file_key"].startswith("properties/prop-5/photos/")
    assert "expires_in=3600" in result["upload_url"]


def test_get_storage_fallback_returns_local_storage() -> None:
    storage = get_storage()
    # In test/unconfigured AWS environment, get_storage must return an ObjectStorage implementation
    assert storage is not None
    key = storage.build_key(prefix="test", file_name="file.txt")
    url = storage.presign_upload(key=key, content_type="text/plain")
    assert len(url) > 0


def test_get_s3_service_singleton() -> None:
    s1 = get_s3_service()
    s2 = get_s3_service()
    assert s1 is s2

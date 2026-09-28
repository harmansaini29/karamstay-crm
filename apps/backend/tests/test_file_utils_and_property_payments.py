"""
Unit tests for file_utils, property_payments in-code registry, and resilient SMS/FCM pipelines.
"""

import base64
from unittest.mock import MagicMock

try:
    import pytest
except ImportError:
    import contextlib

    class _PytestMock:
        @staticmethod
        def raises(expected_exc):
            @contextlib.contextmanager
            def _cm():
                class Holder:
                    value = None
                h = Holder()
                try:
                    yield h
                except expected_exc as e:
                    h.value = e
                except Exception as other:
                    raise AssertionError(f"Expected {expected_exc}, got {other}") from other
                else:
                    raise AssertionError(f"Expected {expected_exc} was not raised")
            return _cm()

    pytest = _PytestMock()
from fastapi import HTTPException

from app.core.file_utils import (
    ALLOWED_DOCUMENT_EXTENSIONS,
    ensure_filename_extension,
    infer_extension_from_mime,
    safe_b64decode,
    sanitize_filename,
    validate_file_extension,
)
from app.core.notify.fcm import send_otp_push
from app.core.notify.sms import SMSSendError, send_sms
from app.core.property_payments import (
    PROPERTY_PAYMENT_REGISTRY,
    get_configured_upi_for_property,
    register_property_payment_override,
    sync_property_payment_ids_to_db,
)
from app.core.storage import LocalStorage, _has_aws_credentials

# ─── File Utilities Tests ───────────────────────────────────────────────────


def test_sanitize_filename_removes_path_traversal() -> None:
    assert sanitize_filename("../../../etc/passwd.pdf") == "passwd.pdf"
    assert sanitize_filename("..\\..\\windows\\system32\\cmd.exe") == "cmd.exe"
    assert sanitize_filename("my documents / legal agreement.pdf") == "_legal_agreement.pdf"
    assert sanitize_filename("my documents and legal agreement.pdf") == "my_documents_and_legal_agreement.pdf"
    assert sanitize_filename("...") == "document"
    assert sanitize_filename("") == "document"


def test_validate_file_extension_allows_valid_types() -> None:
    for ext in ALLOWED_DOCUMENT_EXTENSIONS:
        filename = f"document{ext}"
        assert validate_file_extension(filename) == ext


def test_validate_file_extension_rejects_dangerous_types() -> None:
    dangerous = ["test.exe", "script.sh", "code.py", "hack.php", "page.html", "malware.bat"]
    for fname in dangerous:
        with pytest.raises(HTTPException) as exc_info:
            validate_file_extension(fname)
        assert exc_info.value.status_code == 400


def test_infer_extension_from_mime() -> None:
    assert infer_extension_from_mime("application/pdf") == ".pdf"
    assert infer_extension_from_mime("image/jpeg") == ".jpg"
    assert infer_extension_from_mime("image/png") == ".png"
    docx_mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert infer_extension_from_mime(docx_mime) == ".docx"
    assert infer_extension_from_mime("application/unknown") == ""
    assert infer_extension_from_mime(None) == ""


def test_ensure_filename_extension() -> None:
    # Existing extension is preserved
    assert ensure_filename_extension("lease.pdf", "application/pdf") == "lease.pdf"
    # Missing extension inferred from MIME
    assert ensure_filename_extension("lease_agreement", "application/pdf") == "lease_agreement.pdf"
    assert ensure_filename_extension("photo", "image/png") == "photo.png"
    # Missing extension without MIME remains unchanged but sanitized
    assert ensure_filename_extension("document", None) == "document"
    # Traversal characters sanitized
    assert ensure_filename_extension("../../etc/passwd", "application/pdf") == "passwd.pdf"


def test_safe_b64decode_standard_and_data_urls() -> None:
    original = b"Standard document content for testing legal vault"
    raw_b64 = base64.b64encode(original).decode()

    # Standard plain base64
    assert safe_b64decode(raw_b64) == original

    # Base64 with data URL prefix
    data_url = f"data:application/pdf;base64,{raw_b64}"
    assert safe_b64decode(data_url) == original

    # Base64 with surrounding whitespace and newlines
    whitespace_b64 = f"  \n\t{raw_b64}  \r\n"
    assert safe_b64decode(whitespace_b64) == original

    # Base64 with stripped padding
    unpadded_b64 = raw_b64.rstrip("=")
    assert safe_b64decode(unpadded_b64) == original


def test_safe_b64decode_empty_and_corrupt_payload() -> None:
    with pytest.raises(HTTPException) as exc_empty:
        safe_b64decode("")
    assert exc_empty.value.status_code == 400

    with pytest.raises(HTTPException) as exc_whitespace:
        safe_b64decode("   ")
    assert exc_whitespace.value.status_code == 400

    with pytest.raises(HTTPException) as exc_corrupt:
        safe_b64decode("!!!not-a-valid-base64-string@@@")
    assert exc_corrupt.value.status_code == 400


def test_safe_b64decode_payload_too_large() -> None:
    huge_data = b"x" * 1024
    b64_huge = base64.b64encode(huge_data).decode()
    with pytest.raises(HTTPException) as exc_info:
        safe_b64decode(b64_huge, max_bytes=512)
    assert exc_info.value.status_code == 413


# ─── Property Payments In-Code Registry Tests ───────────────────────────────


def test_get_configured_upi_for_property_precedence() -> None:
    # 1. Exact Name Match
    assert get_configured_upi_for_property(property_name="Property Alpha") == "alpha.karamstay@okhdfcbank"
    assert get_configured_upi_for_property(property_name="Property Beta") == "beta.karamstay@okaxis"

    # 2. Case-Insensitive & Whitespace-Tolerant Match
    assert get_configured_upi_for_property(property_name="  property alpha  ") == "alpha.karamstay@okhdfcbank"
    assert get_configured_upi_for_property(property_name="PROPERTY BETA") == "beta.karamstay@okaxis"

    # 3. Default fallback for unlisted property
    default_upi = PROPERTY_PAYMENT_REGISTRY.get("default", "karamstay@okhdfcbank")
    assert get_configured_upi_for_property(property_name="Random Unregistered Property") == default_upi
    assert get_configured_upi_for_property(property_name=None, property_id=None) == default_upi


def test_register_property_payment_override() -> None:
    try:
        register_property_payment_override("Test Custom Villa", "custom.villa@okhdfcbank")
        assert get_configured_upi_for_property(property_name="Test Custom Villa") == "custom.villa@okhdfcbank"

        # Numeric ID override
        register_property_payment_override(9999, "id9999@okicici")
        assert get_configured_upi_for_property(property_id=9999) == "id9999@okicici"

        # Test allow_default=False
        assert get_configured_upi_for_property(property_name="Unlisted Property XYZ", allow_default=False) is None
    finally:
        PROPERTY_PAYMENT_REGISTRY.pop("Test Custom Villa", None)
        PROPERTY_PAYMENT_REGISTRY.pop(9999, None)


def test_sync_property_payment_ids_to_db_updates_stale_properties() -> None:
    # Mock DB session and Property objects
    prop1 = MagicMock()
    prop1.id = 101
    prop1.name = "Property Alpha"
    prop1.payment_upi_id = "old_stale_id@upi"

    prop2 = MagicMock()
    prop2.id = 102
    prop2.name = "Property Beta"
    prop2.payment_upi_id = "beta.karamstay@okaxis"  # Already current

    prop3 = MagicMock()
    prop3.id = 103
    prop3.name = "Unconfigured Property"
    prop3.payment_upi_id = None  # Missing UPI ID

    mock_db = MagicMock()
    mock_db.scalars.return_value = [prop1, prop2, prop3]

    result = sync_property_payment_ids_to_db(mock_db)

    # prop1 updated
    assert prop1.payment_upi_id == "alpha.karamstay@okhdfcbank"
    # prop2 unchanged
    assert prop2.payment_upi_id == "beta.karamstay@okaxis"
    # prop3 set to default
    assert prop3.payment_upi_id == "karamstay@okhdfcbank"

    assert result["total_properties"] == 3
    assert result["updated_count"] == 2
    mock_db.commit.assert_called_once()


# ─── SMS Multi-Provider Failover & FCM OTP Tests ────────────────────────────


def test_send_sms_fallback_when_unconfigured(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "fast2sms_api_key", None)
    monkeypatch.setattr(settings, "msg91_auth_key", None)
    monkeypatch.setattr(settings, "twilio_account_sid", None)
    monkeypatch.setattr(settings, "twilio_auth_token", None)

    res = send_sms(to="+919876543210", message="Test verification code: 654321")
    assert res["status"] == "fallback"
    assert res["provider"] == "dev_fallback"
    assert res["clean_phone"] == "9876543210"


def test_send_sms_failover_from_failing_provider(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "sms_gateway_provider", "fast2sms")
    monkeypatch.setattr(settings, "fast2sms_api_key", "mock_failing_key")
    monkeypatch.setattr(settings, "twilio_account_sid", "mock_sid")
    monkeypatch.setattr(settings, "twilio_auth_token", "mock_token")

    # Fast2SMS will raise, Twilio succeeds
    def mock_post(url, **kwargs):
        if "fast2sms" in url:
            raise RuntimeError("Fast2SMS gateway network error")
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"sid": "SM12345"}
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    monkeypatch.setattr("httpx.post", mock_post)

    res = send_sms(to="+919876543210", message="Failover test code: 112233")
    assert res["status"] == "sent"
    assert res["provider"] == "twilio"


def test_send_sms_strict_mode_raises_when_all_fail(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "fast2sms_api_key", "mock_key")
    monkeypatch.setattr("httpx.post", MagicMock(side_effect=RuntimeError("Gateway timeout")))

    with pytest.raises(SMSSendError):
        send_sms(to="+919876543210", message="Code: 999999", strict=True)


def test_send_otp_push_returns_skipped_when_fcm_unconfigured() -> None:
    res = send_otp_push(token="fcm_device_token_xyz", code="888888", expire_minutes=10)
    assert res["status"] == "skipped"
    assert res["reason"] == "not_configured"


def test_fast2sms_json_error_failover(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "sms_gateway_provider", "fast2sms")
    monkeypatch.setattr(settings, "fast2sms_api_key", "invalid_key")
    monkeypatch.setattr(settings, "twilio_account_sid", "mock_sid")
    monkeypatch.setattr(settings, "twilio_auth_token", "mock_token")

    # Fast2SMS returns 200 with return=False, Twilio succeeds
    def mock_post(url, **kwargs):
        if "fast2sms" in url:
            mock_resp = MagicMock()
            mock_resp.json.return_value = {"return": False, "message": ["Invalid API Key"]}
            mock_resp.raise_for_status = MagicMock()
            return mock_resp
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"sid": "SM9999"}
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    monkeypatch.setattr("httpx.post", mock_post)
    res = send_sms(to="+919876543210", message="Test Fast2SMS failover")
    assert res["status"] == "sent"
    assert res["provider"] == "twilio"


def test_msg91_json_error_failover(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "sms_gateway_provider", "msg91")
    monkeypatch.setattr(settings, "msg91_auth_key", "invalid_key")
    monkeypatch.setattr(settings, "twilio_account_sid", "mock_sid")
    monkeypatch.setattr(settings, "twilio_auth_token", "mock_token")

    # MSG91 returns 200 with type="error", Twilio succeeds
    def mock_post(url, **kwargs):
        if "msg91" in url:
            mock_resp = MagicMock()
            mock_resp.json.return_value = {"type": "error", "message": "Authentication failed"}
            mock_resp.raise_for_status = MagicMock()
            return mock_resp
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"sid": "SM8888"}
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    monkeypatch.setattr("httpx.post", mock_post)
    res = send_sms(to="+919876543210", message="Test MSG91 failover")
    assert res["status"] == "sent"
    assert res["provider"] == "twilio"


# ─── Storage Security & Local Path Traversal Protection Tests ───────────────


def test_local_storage_rejects_path_traversal_keys() -> None:
    storage = LocalStorage()
    traversal_keys = [
        "../../etc/passwd",
        "..\\..\\windows\\system32\\cmd.exe",
        "/etc/shadow",
        "nested/../../../../root.txt",
    ]
    for key in traversal_keys:
        resolved = storage._resolve_path(key)
        assert resolved is None, f"Expected traversal to be blocked for {key}, got {resolved}"

    safe_resolved = storage._resolve_path("documents/tenant-1/lease.pdf")
    assert safe_resolved is not None
    assert "lease.pdf" in str(safe_resolved)


def test_has_aws_credentials_in_local_dev(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "environment", "local")
    monkeypatch.setattr(settings, "aws_access_key_id", None)
    monkeypatch.setattr(settings, "aws_secret_access_key", None)
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "")
    monkeypatch.setenv("ECS_CONTAINER_METADATA_URI_V4", "")
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "")
    monkeypatch.setenv("AWS_EXECUTION_ENV", "")

    assert _has_aws_credentials() is False

    monkeypatch.setattr(settings, "aws_access_key_id", "AKIAIOSFODNN7EXAMPLE")
    monkeypatch.setattr(settings, "aws_secret_access_key", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")
    assert _has_aws_credentials() is True


def test_s3_storage_presign_download_falls_back_when_file_local_only(monkeypatch) -> None:
    from app.core.storage import S3Storage

    mock_boto_client = MagicMock()
    mock_boto_client.head_object.side_effect = RuntimeError("404 NoSuchKey")

    def mock_init(self):
        self._bucket = "karamstay-prod-app-storage-907079642634"
        self._default_expires = 300
        self._fallback_local = LocalStorage()
        self._client = mock_boto_client

    monkeypatch.setattr(S3Storage, "__init__", mock_init)
    storage = S3Storage()

    key = "documents/tenant-5/agreement.pdf"
    storage._fallback_local.upload_bytes(key=key, data=b"Test PDF Content", content_type="application/pdf")

    download_url = storage.presign_download(key=key)
    assert "/api/v1/storage/file" in download_url
    assert "action=get" in download_url
    assert key in download_url

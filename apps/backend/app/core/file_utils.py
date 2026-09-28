"""
KaramStay File & Storage Utilities.

Provides production-grade validation, sanitization, and base64 handling for:
- Legal Documents & Tenancy Agreements
- Tenant KYC Images (Aadhaar, Passport Photos, Signatures)
- Offline Verification Uploads (Stamp Paper, Police NOC, Notary)
- Vault Storage
"""

import base64
import os
import re

from fastapi import HTTPException, status

MAX_DOCUMENT_BYTES = 25 * 1024 * 1024  # 25 MB
ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".docx", ".doc", ".txt"}


MIME_TO_EXTENSION: dict[str, str] = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "text/plain": ".txt",
}

EXTENSION_TO_MIME: dict[str, str] = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".txt": "text/plain",
}


def sanitize_filename(name: str) -> str:
    """Sanitize filename to prevent path traversal and shell injection."""
    base = os.path.basename(name.strip())
    # Replace dangerous or traversal characters
    safe = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", base)
    # Remove consecutive periods to avoid directory traversal
    safe = re.sub(r"\.{2,}", ".", safe)
    return safe or "document"


def infer_extension_from_mime(content_type: str | None) -> str:
    """Infer file extension from content-type header."""
    if not content_type:
        return ""
    mime = content_type.lower().split(";")[0].strip()
    return MIME_TO_EXTENSION.get(mime, "")


def get_content_type_for_file(filename: str, fallback: str = "application/octet-stream") -> str:
    """Detect appropriate content-type from file extension."""
    _, ext = os.path.splitext(filename)
    return EXTENSION_TO_MIME.get(ext.lower().strip(), fallback)


def ensure_filename_extension(filename: str, content_type: str | None = None) -> str:
    """Ensure filename has a valid extension, appending inferred extension if missing."""
    safe = sanitize_filename(filename)
    _, ext = os.path.splitext(safe)
    if not ext and content_type:
        inferred = infer_extension_from_mime(content_type)
        if inferred:
            safe = f"{safe}{inferred}"
    return safe


def validate_file_extension(
    filename: str,
    allowed: set[str] | None = None,
    content_type: str | None = None,
) -> str:
    """Validate that filename has an allowed extension and return normalized lowercase extension."""
    allowed_exts = allowed or ALLOWED_DOCUMENT_EXTENSIONS
    safe_name = ensure_filename_extension(filename, content_type)
    _, ext = os.path.splitext(safe_name)
    normalized = ext.lower().strip()
    if not normalized or normalized not in allowed_exts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file extension '{normalized}'. "
                f"Allowed extensions: {', '.join(sorted(allowed_exts))}"
            ),
        )
    return normalized


def safe_b64decode(data_b64: str, max_bytes: int = MAX_DOCUMENT_BYTES) -> bytes:
    """Safely decode base64 string, stripping whitespace, headers, and fixing padding."""
    if not data_b64 or not data_b64.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content payload is empty.",
        )

    clean_str = data_b64.strip()
    # Strip data URL prefix if present (e.g. 'data:image/jpeg;base64,...')
    if "," in clean_str:
        clean_str = clean_str.split(",", 1)[1].strip()

    # Normalize missing padding
    missing_padding = len(clean_str) % 4
    if missing_padding:
        clean_str += "=" * (4 - missing_padding)

    try:
        raw_bytes = base64.b64decode(clean_str)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid base64 document encoding: {exc}",
        ) from exc

    if len(raw_bytes) > max_bytes:
        max_mb = max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {max_mb}MB.",
        )

    return raw_bytes

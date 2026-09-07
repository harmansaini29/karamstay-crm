"""
AWS S3 Storage Service Module.

Provides atomic S3 operations for:
  - Tenant KYC Documents (ID proofs, Aadhaar, PAN, Passports)
  - Legal Tenancy Agreements & Addenda
  - Property & Unit Photos
  - Maintenance Ticket Attachments

Gracefully falls back to LocalStorage when AWS S3 credentials are unset.
"""

from app.core.storage import ObjectStorage, get_storage


class S3Service:
    def __init__(self, storage_client: ObjectStorage | None = None) -> None:
        self._storage = storage_client or get_storage()

    def generate_presigned_upload(
        self,
        *,
        prefix: str,
        file_name: str,
        content_type: str,
        expires_in: int | None = None,
    ) -> dict[str, str]:
        """Generate presigned PUT URL and deterministic key for client direct-upload."""
        file_key = self._storage.build_key(prefix=prefix, file_name=file_name)
        upload_url = self._storage.presign_upload(
            key=file_key,
            content_type=content_type,
            expires_in=expires_in,
        )
        return {
            "upload_url": upload_url,
            "file_key": file_key,
            "file_name": file_name,
            "content_type": content_type,
        }

    def generate_presigned_download(
        self,
        *,
        file_key: str,
        expires_in: int | None = None,
    ) -> str:
        """Generate secure presigned GET URL with configurable TTL."""
        return self._storage.presign_download(key=file_key, expires_in=expires_in)

    def upload_file_bytes(
        self,
        *,
        file_key: str,
        data: bytes,
        content_type: str,
    ) -> None:
        """Store raw bytes directly to storage."""
        self._storage.upload_bytes(key=file_key, data=data, content_type=content_type)

    def delete_file(self, *, file_key: str) -> None:
        """Delete object from storage."""
        self._storage.delete(key=file_key)

    # ── Domain-Specific Presigned Upload Helpers ─────────────────────────────

    def get_kyc_upload_url(
        self,
        *,
        tenant_id: int,
        file_name: str,
        content_type: str = "image/jpeg",
        expires_in: int = 3600,
    ) -> dict[str, str]:
        """Generate presigned upload URL for tenant KYC verification document."""
        return self.generate_presigned_upload(
            prefix=f"kyc/tenant-{tenant_id}",
            file_name=file_name,
            content_type=content_type,
            expires_in=expires_in,
        )

    def get_agreement_upload_url(
        self,
        *,
        tenancy_id: int,
        file_name: str,
        content_type: str = "application/pdf",
        expires_in: int = 3600,
    ) -> dict[str, str]:
        """Generate presigned upload URL for executed tenancy agreement."""
        return self.generate_presigned_upload(
            prefix=f"agreements/tenancy-{tenancy_id}",
            file_name=file_name,
            content_type=content_type,
            expires_in=expires_in,
        )

    def get_property_photo_upload_url(
        self,
        *,
        property_id: int,
        file_name: str,
        content_type: str = "image/jpeg",
        expires_in: int = 3600,
    ) -> dict[str, str]:
        """Generate presigned upload URL for property or unit listing photos."""
        return self.generate_presigned_upload(
            prefix=f"properties/prop-{property_id}/photos",
            file_name=file_name,
            content_type=content_type,
            expires_in=expires_in,
        )

    def get_maintenance_attachment_upload_url(
        self,
        *,
        ticket_id: int,
        file_name: str,
        content_type: str = "image/jpeg",
        expires_in: int = 3600,
    ) -> dict[str, str]:
        """Generate presigned upload URL for maintenance work order attachments."""
        return self.generate_presigned_upload(
            prefix=f"maintenance/ticket-{ticket_id}",
            file_name=file_name,
            content_type=content_type,
            expires_in=expires_in,
        )


_s3_service_instance: S3Service | None = None


def get_s3_service() -> S3Service:
    global _s3_service_instance
    if _s3_service_instance is None:
        _s3_service_instance = S3Service()
    return _s3_service_instance

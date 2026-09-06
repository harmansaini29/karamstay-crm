import logging
from typing import Protocol
from uuid import uuid4

from app.core.config import settings

logger = logging.getLogger(__name__)


class ObjectStorage(Protocol):
    def build_key(self, *, prefix: str, file_name: str) -> str: ...

    def presign_upload(self, *, key: str, content_type: str, expires_in: int | None = None) -> str: ...

    def presign_download(self, *, key: str, expires_in: int | None = None) -> str: ...

    def upload_bytes(self, *, key: str, data: bytes, content_type: str) -> None: ...

    def delete(self, *, key: str) -> None: ...


class S3Storage:
    """Production AWS S3 Storage implementation using boto3 with SigV4.

    On AWS (ECS Fargate / Lambda): boto3 resolves credentials automatically from
    the attached IAM Task Role — no static keys needed.
    In local dev / CI: pass aws_access_key_id / aws_secret_access_key explicitly.
    """

    def __init__(self) -> None:
        import boto3
        from botocore.client import Config

        self._bucket = settings.aws_s3_bucket or "karamstay-bucket"
        self._default_expires = settings.s3_presigned_url_expire_seconds

        # Only pass explicit credentials when both are provided.
        # When running inside AWS (ECS Fargate) with an IAM Task Role,
        # omitting these lets boto3 resolve credentials from the instance
        # metadata endpoint automatically — this is more secure and correct.
        client_kwargs: dict = {
            "region_name": settings.aws_region or "ap-south-1",
            "config": Config(signature_version="s3v4"),
        }
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            client_kwargs["aws_access_key_id"] = settings.aws_access_key_id
            client_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key

        self._client = boto3.client("s3", **client_kwargs)

    def build_key(self, *, prefix: str, file_name: str) -> str:
        safe_name = file_name.replace("/", "_").replace("\\", "_")
        return f"{prefix.strip('/')}/{uuid4().hex}_{safe_name}"

    def presign_upload(self, *, key: str, content_type: str, expires_in: int | None = None) -> str:
        ttl = expires_in if expires_in is not None else self._default_expires
        return self._client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self._bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=ttl,
        )

    def presign_download(self, *, key: str, expires_in: int | None = None) -> str:
        ttl = expires_in if expires_in is not None else self._default_expires
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=ttl,
        )

    def upload_bytes(self, *, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type)

    def delete(self, *, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)


class LocalStorage:
    """Mock/Fallback storage for local development and test environments when AWS is unconfigured."""

    def __init__(self) -> None:
        self._bucket = settings.aws_s3_bucket or "karamstay-local-bucket"
        self._default_expires = settings.s3_presigned_url_expire_seconds
        self._in_memory_store: dict[str, tuple[bytes, str]] = {}
        logger.info("LocalStorage initialized as fallback for unconfigured AWS S3 environment")

    def build_key(self, *, prefix: str, file_name: str) -> str:
        safe_name = file_name.replace("/", "_").replace("\\", "_")
        return f"{prefix.strip('/')}/{uuid4().hex}_{safe_name}"

    def presign_upload(self, *, key: str, content_type: str, expires_in: int | None = None) -> str:
        ttl = expires_in if expires_in is not None else self._default_expires
        return f"https://s3.local.karamstay.internal/{self._bucket}/{key}?action=put&content_type={content_type}&expires_in={ttl}"

    def presign_download(self, *, key: str, expires_in: int | None = None) -> str:
        ttl = expires_in if expires_in is not None else self._default_expires
        return f"https://s3.local.karamstay.internal/{self._bucket}/{key}?action=get&expires_in={ttl}"

    def upload_bytes(self, *, key: str, data: bytes, content_type: str) -> None:
        self._in_memory_store[key] = (data, content_type)

    def delete(self, *, key: str) -> None:
        self._in_memory_store.pop(key, None)

    def get_stored_data(self, key: str) -> bytes | None:
        item = self._in_memory_store.get(key)
        return item[0] if item else None


_storage: ObjectStorage | None = None


def _running_on_aws() -> bool:
    """Detect whether we are running inside an AWS compute environment.

    ECS Fargate sets ECS_CONTAINER_METADATA_URI_V4 in every task. Lambda sets
    AWS_LAMBDA_FUNCTION_NAME. Checking either is enough to know boto3 can
    resolve credentials from the attached IAM Task/Execution Role without any
    explicit access keys.
    """
    import os
    return bool(
        os.environ.get("ECS_CONTAINER_METADATA_URI_V4")
        or os.environ.get("ECS_CONTAINER_METADATA_URI")
        or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
    )


def get_storage() -> ObjectStorage:
    """Return the active ObjectStorage backend.

    Resolution order:
      1. If already initialised, return the cached singleton.
      2. If explicit static credentials (aws_access_key_id + aws_secret_access_key)
         are set, use them → S3Storage.
      3. If we are running inside AWS (ECS Fargate / Lambda) and aws_s3_bucket is
         configured, let boto3 resolve credentials from the IAM Task Role → S3Storage.
      4. Otherwise fall back to LocalStorage (development / CI with no real AWS).
    """
    global _storage
    if _storage is None:
        has_static_creds = bool(
            settings.aws_s3_bucket
            and settings.aws_access_key_id
            and settings.aws_secret_access_key
        )
        has_iam_role = bool(settings.aws_s3_bucket and _running_on_aws())

        if has_static_creds or has_iam_role:
            try:
                _storage = S3Storage()
                logger.info(
                    "Initialized production S3Storage with bucket %s (auth=%s)",
                    settings.aws_s3_bucket,
                    "static-keys" if has_static_creds else "iam-task-role",
                )
            except Exception as e:
                logger.warning("Failed to initialize S3Storage (%s). Falling back to LocalStorage.", e)
                _storage = LocalStorage()
        else:
            logger.info("AWS S3 not configured — using LocalStorage (dev/test mode).")
            _storage = LocalStorage()
    return _storage

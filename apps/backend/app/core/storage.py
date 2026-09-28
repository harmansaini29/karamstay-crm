import logging
import os
from pathlib import Path
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

    def list_objects(self, *, prefix: str = "") -> list[dict]: ...

    def get_bytes(self, *, key: str) -> bytes | None: ...

    def object_exists(self, *, key: str) -> bool: ...


class S3Storage:
    """Production AWS S3 Storage implementation using boto3 with SigV4.

    On AWS (ECS Fargate / Lambda): boto3 resolves credentials automatically from
    the attached IAM Task Role — no static keys needed.
    In local dev / CI: pass aws_access_key_id / aws_secret_access_key explicitly.
    """

    def __init__(self) -> None:
        import boto3
        from botocore.client import Config

        self._bucket = settings.aws_s3_bucket or "karamstay-prod-app-storage-907079642634"
        self._default_expires = settings.s3_presigned_url_expire_seconds
        self._fallback_local = LocalStorage()

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
        try:
            params: dict[str, str] = {"Bucket": self._bucket, "Key": key}
            if content_type:
                params["ContentType"] = content_type
            return self._client.generate_presigned_url(
                "put_object",
                Params=params,
                ExpiresIn=ttl,
            )
        except Exception as exc:
            logger.warning("S3 presign_upload failed (%s); using fallback endpoint", exc)
            return self._fallback_local.presign_upload(key=key, content_type=content_type, expires_in=expires_in)

    def presign_download(self, *, key: str, expires_in: int | None = None) -> str:
        ttl = expires_in if expires_in is not None else self._default_expires
        if self._fallback_local.object_exists(key=key):
            try:
                self._client.head_object(Bucket=self._bucket, Key=key)
            except Exception:
                return self._fallback_local.presign_download(key=key, expires_in=expires_in)
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=ttl,
            )
        except Exception as exc:
            logger.warning("S3 presign_download failed (%s); using fallback endpoint", exc)
            return self._fallback_local.presign_download(key=key, expires_in=expires_in)

    def upload_bytes(self, *, key: str, data: bytes, content_type: str) -> None:
        try:
            self._client.put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type)
        except Exception as exc:
            logger.warning("AWS S3 put_object failed for %s: %s; saving to local fallback storage", key, exc)
            self._fallback_local.upload_bytes(key=key, data=data, content_type=content_type)

    def delete(self, *, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except Exception:
            pass
        self._fallback_local.delete(key=key)

    def list_objects(self, *, prefix: str = "") -> list[dict]:
        try:
            paginator = self._client.get_paginator("list_objects_v2")
            pages = paginator.paginate(Bucket=self._bucket, Prefix=prefix.lstrip("/"))
            results = []
            for page in pages:
                for obj in page.get("Contents", []):
                    k = obj["Key"]
                    results.append({
                        "key": k,
                        "size": obj["Size"],
                        "last_modified": obj["LastModified"].isoformat(),
                        "download_url": self.presign_download(key=k),
                    })
            if results:
                return results
        except Exception as exc:
            logger.warning("S3 list_objects error for prefix %s: %s", prefix, exc)
        return self._fallback_local.list_objects(prefix=prefix)

    def get_bytes(self, *, key: str) -> bytes | None:
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=key)
            return resp["Body"].read()
        except Exception as exc:
            logger.debug("S3 get_bytes failed for %s: %s; checking local fallback", key, exc)
            return self._fallback_local.get_bytes(key=key)

    def object_exists(self, *, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except Exception:
            return self._fallback_local.object_exists(key=key)


class LocalStorage:
    """Mock/Fallback storage for local development, tests, and resilient offline fallback."""

    def __init__(self) -> None:
        self._bucket = settings.aws_s3_bucket or "karamstay-local-bucket"
        self._default_expires = settings.s3_presigned_url_expire_seconds
        self._in_memory_store: dict[str, tuple[bytes, str]] = {}
        storage_dir_name = os.environ.get("KARAMSTAY_STORAGE_DIR", "data/storage")
        self._storage_dir = Path(storage_dir_name)
        try:
            self._storage_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            logger.warning("Could not create local storage directory %s: %s", self._storage_dir, exc)
        logger.info("LocalStorage initialized with storage dir %s", self._storage_dir)

    def build_key(self, *, prefix: str, file_name: str) -> str:
        safe_name = file_name.replace("/", "_").replace("\\", "_")
        return f"{prefix.strip('/')}/{uuid4().hex}_{safe_name}"

    def presign_upload(self, *, key: str, content_type: str, expires_in: int | None = None) -> str:
        ttl = expires_in if expires_in is not None else self._default_expires
        return f"/api/v1/storage/file?key={key}&action=put&content_type={content_type}&expires_in={ttl}"

    def presign_download(self, *, key: str, expires_in: int | None = None) -> str:
        ttl = expires_in if expires_in is not None else self._default_expires
        return f"/api/v1/storage/file?key={key}&action=get&expires_in={ttl}"

    def _resolve_path(self, key: str) -> Path | None:
        if not key:
            return None
        # Disallow absolute paths, leading slashes/backslashes, and Windows drive prefixes
        if key.startswith(("/", "\\")) or (len(key) >= 2 and key[1] == ":") or Path(key).is_absolute():
            logger.warning("Invalid or absolute path key detected: %s", key)
            return None

        # Check for directory traversal sequences
        normalized = key.replace("\\", "/")
        parts = normalized.split("/")
        if any(part == ".." for part in parts):
            logger.warning("Path traversal attempt detected for key: %s", key)
            return None

        try:
            full_path = (self._storage_dir / normalized).resolve()
            full_path.relative_to(self._storage_dir.resolve())
            return full_path
        except (ValueError, Exception):
            logger.warning("Path traversal attempt detected for key: %s", key)
            return None

    def upload_bytes(self, *, key: str, data: bytes, content_type: str) -> None:
        self._in_memory_store[key] = (data, content_type)
        target_path = self._resolve_path(key)
        if target_path:
            try:
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.write_bytes(data)
            except Exception as exc:
                logger.warning("Could not persist file to disk %s: %s", key, exc)

    def delete(self, *, key: str) -> None:
        self._in_memory_store.pop(key, None)
        target_path = self._resolve_path(key)
        if target_path and target_path.is_file():
            try:
                target_path.unlink()
            except Exception:
                pass

    def get_stored_data(self, key: str) -> bytes | None:
        item = self._in_memory_store.get(key)
        if item:
            return item[0]
        target_path = self._resolve_path(key)
        if target_path and target_path.is_file():
            try:
                return target_path.read_bytes()
            except Exception:
                pass
        return None

    def list_objects(self, *, prefix: str = "") -> list[dict]:
        results = []
        clean_prefix = prefix.lstrip("/")
        # Scan in-memory
        seen_keys: set[str] = set()
        for key, (data, _ct) in self._in_memory_store.items():
            if not clean_prefix or key.startswith(clean_prefix):
                seen_keys.add(key)
                results.append({
                    "key": key,
                    "size": len(data),
                    "last_modified": "2026-09-28T12:00:00+00:00",
                    "download_url": self.presign_download(key=key),
                })
        # Scan disk
        if self._storage_dir.exists():
            for root, _, files in os.walk(self._storage_dir):
                for f in files:
                    full_p = Path(root) / f
                    rel_k = full_p.relative_to(self._storage_dir).as_posix()
                    if rel_k not in seen_keys and (not clean_prefix or rel_k.startswith(clean_prefix)):
                        seen_keys.add(rel_k)
                        results.append({
                            "key": rel_k,
                            "size": full_p.stat().st_size,
                            "last_modified": "2026-09-28T12:00:00+00:00",
                            "download_url": self.presign_download(key=rel_k),
                        })
        return results

    def get_bytes(self, *, key: str) -> bytes | None:
        return self.get_stored_data(key)

    def object_exists(self, *, key: str) -> bool:
        if key in self._in_memory_store:
            return True
        target_path = self._resolve_path(key)
        return bool(target_path and target_path.is_file())


_storage: ObjectStorage | None = None


def _running_on_aws() -> bool:
    """Detect whether we are running inside an AWS compute environment."""
    return bool(
        os.environ.get("ECS_CONTAINER_METADATA_URI_V4")
        or os.environ.get("ECS_CONTAINER_METADATA_URI")
        or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
        or os.environ.get("AWS_EXECUTION_ENV")
    )


def _has_aws_credentials() -> bool:
    """Check if AWS credentials are provided via settings, environment, or IAM roles."""
    key_id = (settings.aws_access_key_id or "").strip()
    secret = (settings.aws_secret_access_key or "").strip()
    if key_id and secret and key_id != "REPLACE_ME" and secret != "REPLACE_ME":
        return True

    env_key = os.environ.get("AWS_ACCESS_KEY_ID", "").strip()
    env_secret = os.environ.get("AWS_SECRET_ACCESS_KEY", "").strip()
    if env_key and env_secret and env_key != "REPLACE_ME" and env_secret != "REPLACE_ME":
        return True

    if _running_on_aws():
        return True

    if settings.environment == "production":
        if os.environ.get("AWS_PROFILE"):
            return True
        try:
            import botocore.session

            session = botocore.session.get_session()
            creds = session.get_credentials()
            if creds is not None:
                return True
        except Exception:
            pass

    return False


def get_storage() -> ObjectStorage:
    """Return the active ObjectStorage backend."""
    global _storage
    if _storage is None:
        if _has_aws_credentials():
            try:
                _storage = S3Storage()
                logger.info(
                    "Initialized production S3Storage with bucket %s",
                    settings.aws_s3_bucket,
                )
            except Exception as e:
                logger.warning("Failed to initialize S3Storage (%s). Falling back to LocalStorage.", e)
                _storage = LocalStorage()
        else:
            logger.info("AWS S3 credentials unset — using LocalStorage (dev/test mode).")
            _storage = LocalStorage()
    return _storage

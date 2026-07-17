from typing import Protocol
from uuid import uuid4

import boto3
from botocore.client import Config

from app.core.config import settings


class ObjectStorage(Protocol):
    def build_key(self, *, prefix: str, file_name: str) -> str: ...

    def presign_upload(self, *, key: str, content_type: str) -> str: ...

    def presign_download(self, *, key: str) -> str: ...

    def upload_bytes(self, *, key: str, data: bytes, content_type: str) -> None: ...

    def delete(self, *, key: str) -> None: ...


class S3Storage:
    def __init__(self) -> None:
        self._bucket = settings.aws_s3_bucket
        self._expires_in = settings.s3_presigned_url_expire_seconds
        self._client = boto3.client(
            "s3",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            config=Config(signature_version="s3v4"),
        )

    def build_key(self, *, prefix: str, file_name: str) -> str:
        safe_name = file_name.replace("/", "_").replace("\\", "_")
        return f"{prefix.strip('/')}/{uuid4().hex}_{safe_name}"

    def presign_upload(self, *, key: str, content_type: str) -> str:
        return self._client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self._bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=self._expires_in,
        )

    def presign_download(self, *, key: str) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=self._expires_in,
        )

    def upload_bytes(self, *, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type)

    def delete(self, *, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)


_storage: ObjectStorage | None = None


def get_storage() -> ObjectStorage:
    global _storage
    if _storage is None:
        _storage = S3Storage()
    return _storage

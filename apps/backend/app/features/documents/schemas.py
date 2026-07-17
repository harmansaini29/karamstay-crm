from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PresignUploadRequest(BaseModel):
    document_type: str = Field(min_length=2, max_length=60)
    file_name: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=3, max_length=120)
    tenant_id: int | None = None
    property_id: int | None = None

    @model_validator(mode="after")
    def _require_owner_target(self) -> "PresignUploadRequest":
        if self.tenant_id is None and self.property_id is None:
            raise ValueError("Either tenant_id or property_id must be provided")
        return self


class PresignUploadResponse(BaseModel):
    upload_url: str
    file_key: str


class DocumentCreate(BaseModel):
    document_type: str = Field(min_length=2, max_length=60)
    file_key: str = Field(min_length=1, max_length=512)
    file_name: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=3, max_length=120)
    tenant_id: int | None = None
    property_id: int | None = None
    maintenance_ticket_id: int | None = None

    @model_validator(mode="after")
    def _require_owner_target(self) -> "DocumentCreate":
        if self.tenant_id is None and self.property_id is None:
            raise ValueError("Either tenant_id or property_id must be provided")
        return self


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int | None
    property_id: int | None
    maintenance_ticket_id: int | None
    document_type: str
    file_name: str
    content_type: str
    uploaded_by_id: int | None
    created_at: datetime
    status: str
    status_updated_at: datetime | None
    status_updated_by_id: int | None
    rejection_reason: str | None


class DocumentDownloadResponse(BaseModel):
    download_url: str


class DocumentStatusUpdate(BaseModel):
    status: Literal["approved", "rejected"]
    rejection_reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _require_reason_on_rejection(self) -> "DocumentStatusUpdate":
        if self.status == "rejected" and not self.rejection_reason:
            raise ValueError("rejection_reason is required when rejecting a document")
        return self

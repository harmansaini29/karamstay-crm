from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AgreementCreate(BaseModel):
    tenancy_id: int
    tenant_id: int
    template_id: str = "A"
    template_name: str = "Standard Agreement"


class AgreementUpdate(BaseModel):
    status: str | None = None
    tracker_stage: int | None = None
    form_data: dict[str, Any] | None = None
    docx_file_name: str | None = None


class OfflineUploadCreate(BaseModel):
    upload_type: str
    file_name: str
    notes: str | None = None


class OfflineUploadStatusUpdate(BaseModel):
    status: str


class OfflineUploadResponse(BaseModel):
    id: int
    agreement_id: int
    upload_type: str
    file_name: str
    status: str
    notes: str | None
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class AgreementResponse(BaseModel):
    id: int
    tenancy_id: int
    tenant_id: int
    template_id: str
    template_name: str
    status: str
    tracker_stage: int
    form_data: dict[str, Any] | None
    docx_file_name: str | None
    docx_generated_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

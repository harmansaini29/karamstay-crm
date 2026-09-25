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
    tenant_photo_key: str | None = None
    aadhar_card_key: str | None = None
    signature_key: str | None = None
    s3_folder_path: str | None = None
    s3_archive_url: str | None = None


class OfflineUploadCreate(BaseModel):
    upload_type: str
    file_name: str
    notes: str | None = None
    file_base64: str | None = None


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
    s3_key: str | None = None
    file_url: str | None = None
    download_url: str | None = None

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
    tenant_photo_key: str | None = None
    aadhar_card_key: str | None = None
    signature_key: str | None = None
    s3_folder_path: str | None = None
    s3_archive_url: str | None = None
    tenant_photo_url: str | None = None
    aadhar_card_url: str | None = None
    signature_url: str | None = None
    docx_download_url: str | None = None
    pdf_download_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}



class AgreementKycSubmit(BaseModel):
    form_data: dict[str, Any]
    tenant_photo_base64: str | None = None
    aadhar_card_base64: str | None = None
    signature_base64: str | None = None
    tenant_photo_file_name: str | None = "tenant_photo.jpg"
    aadhar_card_file_name: str | None = "aadhar_card.jpg"
    signature_file_name: str | None = "signature.png"


class AgreementApproveResponse(BaseModel):
    agreement: AgreementResponse
    s3_folder_path: str
    archived_files: list[str]
    message: str

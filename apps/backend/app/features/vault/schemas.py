from typing import Literal

from pydantic import BaseModel, ConfigDict


class VaultFileItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    name: str
    file_type: Literal["image", "pdf", "docx", "document", "other"]
    size: int
    last_modified: str
    download_url: str


class VaultFolderNode(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    folder: str
    tenant_id: int | None = None
    tenant_name: str
    unit_name: str
    files: list[VaultFileItem]


class VaultTreeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    folders: list[VaultFolderNode]
    total_files: int
    bucket: str


class VaultUploadRequest(BaseModel):
    folder: str
    file_name: str
    file_base64: str
    content_type: str = "application/octet-stream"


class VaultCompilePdfRequest(BaseModel):
    image_keys: list[str]
    output_file_name: str = "compiled_images.pdf"
    folder: str | None = None
    output_folder: str | None = None
    title: str = "KYC & Verification Document Compilation"


class VaultCompileDocxRequest(BaseModel):
    image_keys: list[str]
    output_file_name: str = "compiled_images.docx"
    folder: str | None = None
    output_folder: str | None = None
    title: str = "KYC & Verification Document Compilation"


class VaultOperationResponse(BaseModel):
    success: bool
    message: str
    key: str | None = None
    download_url: str | None = None

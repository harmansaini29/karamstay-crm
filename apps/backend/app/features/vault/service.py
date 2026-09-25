import base64
import io
import logging
import os
import re
import tempfile
import zipfile
from datetime import datetime, timezone
from xml.sax.saxutils import escape as xml_escape

from fastapi import HTTPException, status
from fpdf import FPDF
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.storage import get_storage
from app.features.auth.models import User
from app.features.vault.schemas import (
    VaultCompileDocxRequest,
    VaultCompilePdfRequest,
    VaultFileItem,
    VaultFolderNode,
    VaultOperationResponse,
    VaultTreeResponse,
    VaultUploadRequest,
)

logger = logging.getLogger(__name__)


def _detect_file_type(name: str) -> str:
    ext = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    if ext in ("jpg", "jpeg", "png", "webp", "gif"):
        return "image"
    if ext == "pdf":
        return "pdf"
    if ext in ("docx", "doc"):
        return "docx"
    return "document"


class VaultService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.storage = get_storage()

    def _assert_access(self, current_user: User) -> None:
        if current_user.role.name not in ("owner", "manager", "staff"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to Confidential Vault")

    def get_vault_tree(self, current_user: User) -> VaultTreeResponse:
        self._assert_access(current_user)

        # List all objects under tenants/
        objects = self.storage.list_objects(prefix="tenants")
        if not objects:
            # Check root if empty
            objects = self.storage.list_objects(prefix="")

        folder_map: dict[str, list[VaultFileItem]] = {}
        total_files = 0

        for obj in objects:
            key = obj["key"]
            if not key or key.endswith("/"):
                continue

            total_files += 1
            filename = key.rsplit("/", 1)[-1]
            folder = key.rsplit("/", 1)[0] if "/" in key else "root"
            ftype = _detect_file_type(filename)

            item = VaultFileItem(
                key=key,
                name=filename,
                file_type=ftype,  # type: ignore[arg-type]
                size=obj.get("size", 0),
                last_modified=obj.get("last_modified", datetime.now(timezone.utc).isoformat()),
                download_url=obj.get("download_url") or self.storage.presign_download(key=key),
            )
            folder_map.setdefault(folder, []).append(item)

        nodes: list[VaultFolderNode] = []
        for folder, files in folder_map.items():
            # Derive tenant name & room from path: tenants/{tenant_name}_{id}/{unit_name}
            tenant_name = "General Vault"
            unit_name = "Storage"
            tenant_id = None

            parts = folder.split("/")
            if len(parts) >= 2 and parts[0] == "tenants":
                tenant_slug = parts[1]
                match = re.search(r"^(.*)_(\d+)$", tenant_slug)
                if match:
                    tenant_name = match.group(1).replace("_", " ")
                    tenant_id = int(match.group(2))
                else:
                    tenant_name = tenant_slug.replace("_", " ")

                if len(parts) >= 3:
                    unit_name = parts[2].replace("_", " ")

            nodes.append(
                VaultFolderNode(
                    folder=folder,
                    tenant_id=tenant_id,
                    tenant_name=tenant_name,
                    unit_name=unit_name,
                    files=files,
                )
            )

        bucket_name = settings.aws_s3_bucket or "karamstay-prod-app-storage"
        return VaultTreeResponse(folders=nodes, total_files=total_files, bucket=bucket_name)

    def upload_file(self, payload: VaultUploadRequest, current_user: User) -> VaultOperationResponse:
        self._assert_access(current_user)

        folder = payload.folder.strip("/")
        safe_name = payload.file_name.replace("/", "_").replace("\\", "_")
        key = f"{folder}/{safe_name}"

        b64_data = payload.file_base64
        if "," in b64_data:
            b64_data = b64_data.split(",", 1)[1]

        raw_bytes = base64.b64decode(b64_data)
        self.storage.upload_bytes(key=key, data=raw_bytes, content_type=payload.content_type)
        download_url = self.storage.presign_download(key=key)

        return VaultOperationResponse(
            success=True,
            message=f"File {safe_name} successfully uploaded/replaced in AWS S3 vault.",
            key=key,
            download_url=download_url,
        )

    def delete_file(self, key: str, current_user: User) -> VaultOperationResponse:
        self._assert_access(current_user)
        self.storage.delete(key=key)
        return VaultOperationResponse(
            success=True,
            message=f"File {key} deleted from AWS S3 vault.",
            key=key,
        )

    def compile_images_to_pdf(self, payload: VaultCompilePdfRequest, current_user: User) -> VaultOperationResponse:
        """Compile a list of selected images from S3 into a single clean PDF document."""
        self._assert_access(current_user)

        if not payload.image_keys:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No images specified to compile")

        pdf = FPDF(orientation="P", unit="mm", format="A4")
        pdf.set_auto_page_break(auto=True, margin=15)

        temp_files: list[str] = []

        try:
            for idx, key in enumerate(payload.image_keys):
                img_data = self.storage.get_bytes(key=key)
                if not img_data:
                    continue

                pdf.add_page()
                pdf.set_font("Helvetica", "B", 14)
                pdf.cell(0, 10, f"{payload.title} - Page {idx + 1}", ln=True, align="C")
                pdf.set_font("Helvetica", "", 10)
                pdf.cell(0, 6, f"Source File: {key.rsplit('/', 1)[-1]}", ln=True, align="C")
                pdf.ln(5)

                # Write to temp file so fpdf can parse image dimensions
                ext = key.rsplit(".", 1)[-1] if "." in key else "jpg"
                with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
                    tmp.write(img_data)
                    tmp_path = tmp.name
                    temp_files.append(tmp_path)

                try:
                    # Place image centered on page
                    pdf.image(tmp_path, x=20, y=35, w=170)
                except Exception as img_err:
                    logger.warning("Failed to render image %s in PDF: %s", key, img_err)
                    pdf.set_font("Helvetica", "I", 10)
                    pdf.cell(0, 10, f"[Image rendering preview for {key.rsplit('/', 1)[-1]}]", ln=True, align="C")

            pdf_buf = io.BytesIO()
            pdf.output(pdf_buf)
            pdf_bytes = pdf_buf.getvalue()

            folder = payload.folder or payload.output_folder or "compiled_docs"
            output_key = f"{folder.strip('/')}/{payload.output_file_name}"
            self.storage.upload_bytes(key=output_key, data=pdf_bytes, content_type="application/pdf")
            download_url = self.storage.presign_download(key=output_key)

            return VaultOperationResponse(
                success=True,
                message=f"Successfully compiled {len(payload.image_keys)} images into PDF: {payload.output_file_name}",
                key=output_key,
                download_url=download_url,
            )
        finally:
            for path in temp_files:
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except Exception:
                        pass

    def compile_images_to_docx(self, payload: VaultCompileDocxRequest, current_user: User) -> VaultOperationResponse:
        """Compile a list of selected images from S3 into a Word document (.docx)."""
        self._assert_access(current_user)

        if not payload.image_keys:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No images specified to compile")

        body_parts = []
        body_parts.append(
            f'<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr>'
            f'<w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>{xml_escape(payload.title)}</w:t></w:r></w:p>'
        )
        gen_time = datetime.now(timezone.utc).strftime("%d %B %Y %H:%M UTC")
        img_count = len(payload.image_keys)
        body_parts.append(
            f'<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="300"/></w:pPr>'
            f'<w:r><w:rPr><w:sz w:val="20"/><w:color w:val="6B7280"/></w:rPr>'
            f"<w:t>Generated on {gen_time} | Total Images: {img_count}</w:t></w:r></w:p>"
        )

        for idx, key in enumerate(payload.image_keys):
            filename = key.rsplit("/", 1)[-1]
            body_parts.append(
                f'<w:p><w:pPr><w:spacing w:before="240" w:after="100"/></w:pPr>'
                f'<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr>'
                f"<w:t>Attachment #{idx + 1}: {xml_escape(filename)}</w:t></w:r></w:p>"
            )
            body_parts.append(
                f'<w:p><w:pPr><w:spacing w:after="140"/></w:pPr>'
                f'<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="4B5563"/></w:rPr>'
                f"<w:t>S3 Vault Key: {xml_escape(key)}</w:t></w:r></w:p>"
            )

        document_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            '<w:body>'
            + "".join(body_parts)
            + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>'
            '</w:body></w:document>'
        )

        content_types_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
            '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
            '  <Default Extension="xml" ContentType="application/xml"/>\n'
            '  <Override PartName="/word/document.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n'
            "</Types>"
        )

        rels_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
            '  <Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="word/document.xml"/>\n'
            "</Relationships>"
        )

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("[Content_Types].xml", content_types_xml)
            zf.writestr("_rels/.rels", rels_xml)
            zf.writestr("word/document.xml", document_xml)

        docx_bytes = zip_buf.getvalue()
        folder = payload.folder or payload.output_folder or "compiled_docs"
        output_key = f"{folder.strip('/')}/{payload.output_file_name}"
        self.storage.upload_bytes(
            key=output_key,
            data=docx_bytes,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        download_url = self.storage.presign_download(key=output_key)

        msg = f"Successfully compiled {len(payload.image_keys)} images into Word document: {payload.output_file_name}"
        return VaultOperationResponse(
            success=True,
            message=msg,
            key=output_key,
            download_url=download_url,
        )

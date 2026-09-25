"""OpenXML Word (.docx) and PDF Document Generator for KaramStay Agreements.

Generates valid, professional Microsoft Word (.docx) and PDF documents
without requiring external desktop binaries, fully compatible with MS Word,
Google Docs, Apple Pages, and PDF viewers.
"""

import io
import logging
import os
import re
import tempfile
import zipfile
from datetime import datetime, timezone
from xml.sax.saxutils import escape as xml_escape

from fpdf import FPDF

from app.features.agreements.models import Agreement
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant

logger = logging.getLogger(__name__)


def _build_p(text: str, bold: bool = False, size_pt: int = 11, align: str = "left", space_after: int = 120) -> str:
    """Build a WordprocessingML paragraph."""
    align_xml = f'<w:jc w:val="{align}"/>' if align != "left" else ""
    bold_xml = "<w:b/>" if bold else ""
    half_pts = size_pt * 2
    escaped_text = xml_escape(str(text or ""))
    return (
        f'<w:p>'
        f'<w:pPr>'
        f'{align_xml}'
        f'<w:spacing w:after="{space_after}"/>'
        f'</w:pPr>'
        f'<w:r>'
        f'<w:rPr>'
        f'{bold_xml}'
        f'<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
        f'<w:sz w:val="{half_pts}"/>'
        f'<w:szCs w:val="{half_pts}"/>'
        f'</w:rPr>'
        f'<w:t xml:space="preserve">{escaped_text}</w:t>'
        f'</w:r>'
        f'</w:p>'
    )


def _build_table_row(label: str, value: str) -> str:
    """Build a 2-column key-value table row."""
    escaped_label = xml_escape(str(label or ""))
    escaped_val = xml_escape(str(value or ""))
    return (
        '<w:tr>'
        '<w:tc>'
        '<w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/></w:tcPr>'
        '<w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr>'
        f'<w:t>{escaped_label}</w:t></w:r></w:p>'
        '</w:tc>'
        '<w:tc>'
        '<w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr>'
        '<w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/></w:rPr>'
        f'<w:t>{escaped_val}</w:t></w:r></w:p>'
        '</w:tc>'
        '</w:tr>'
    )


def build_agreement_docx(
    agreement: Agreement,
    tenant: Tenant,
    tenancy: Tenancy | None,
    unit: Unit | None,
    property_: Property | None,
) -> bytes:
    """Compile an Agreement into a valid OpenXML Word Document (.docx)."""
    form_data = agreement.form_data or {}
    tenant_name = form_data.get("full_name") or tenant.name
    id_num = form_data.get("identity_number") or "N/A (Pending Verification)"
    phone = form_data.get("phone") or tenant.phone
    perm_addr = form_data.get("permanent_address") or "As per KYC Records"
    office_addr = form_data.get("office_address") or "N/A"
    emergency_contact = form_data.get("emergency_contact") or tenant.emergency_contact_name or "N/A"

    prop_name = property_.name if property_ else "KaramStay Residence"
    prop_addr = property_.address if property_ else "Main Street, City"
    unit_str = f"Unit {unit.unit_no}" if unit else "Assigned Room"
    bed_str = f"Bed #{', #'.join(map(str, tenancy.bed_ids))}" if (tenancy and tenancy.bed_ids) else "Private Room"
    monthly_rent = f"INR {tenancy.monthly_rent:,.2f}" if tenancy else "INR 0.00"
    deposit = f"INR {tenancy.security_deposit:,.2f}" if tenancy else "INR 0.00"
    bill_day = str(tenancy.billing_day if tenancy else 1)
    if tenancy and tenancy.start_date:
        start_date = tenancy.start_date.strftime("%d %B %Y")
    else:
        start_date = datetime.now(timezone.utc).strftime("%d %B %Y")

    # Document body XML
    body_parts = []

    # Title & Subtitle
    body_parts.append(
        _build_p(
            "KARAMSTAY RESIDENTIAL TENANCY & LEASE AGREEMENT",
            bold=True,
            size_pt=18,
            align="center",
            space_after=100,
        )
    )
    body_parts.append(
        _build_p(
            f"Template {agreement.template_id}: {agreement.template_name}",
            bold=False,
            size_pt=11,
            align="center",
            space_after=240,
        )
    )
    body_parts.append(
        _build_p(
            f"Agreement ID: KS-AGR-{agreement.id:06d}  |  Date: {start_date}",
            bold=False,
            size_pt=10,
            align="center",
            space_after=300,
        )
    )

    # Preamble
    preamble = (
        f"This Rental Agreement is made and entered into at {prop_addr} on this {start_date}, between the Property "
        f"Management of {prop_name} (hereinafter referred to as the 'Landlord/Owner') of the ONE PART, and "
        f"{tenant_name} (hereinafter referred to as the 'Tenant') of the OTHER PART."
    )
    body_parts.append(_build_p("1. PARTIES TO THE AGREEMENT", bold=True, size_pt=13, space_after=100))
    body_parts.append(_build_p(preamble, space_after=180))

    # Tenant Details Table
    table_rows = [
        _build_table_row("Tenant Full Name", tenant_name),
        _build_table_row("National ID / Aadhaar", id_num),
        _build_table_row("Contact Phone", phone),
        _build_table_row("Permanent Address", perm_addr),
        _build_table_row("Workplace Address", office_addr),
        _build_table_row("Emergency Contact", emergency_contact),
    ]
    table_xml = (
        '<w:tbl>'
        '<w:tblPr>'
        '<w:tblW w:w="9000" w:type="dxa"/>'
        '<w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>'
        '</w:tblBorders>'
        '</w:tblPr>'
        + "".join(table_rows)
        + '</w:tbl>'
    )
    body_parts.append(table_xml)
    body_parts.append(_build_p("", space_after=180))

    # Property & Premises Details
    body_parts.append(_build_p("2. PREMISES & ACCOMMODATION ALLOCATION", bold=True, size_pt=13, space_after=100))
    premises_rows = [
        _build_table_row("Property Name", prop_name),
        _build_table_row("Property Address", prop_addr),
        _build_table_row("Unit / Flat No.", unit_str),
        _build_table_row("Bed / Room Allocation", bed_str),
        _build_table_row("Commencement Date", start_date),
    ]
    premises_table = (
        '<w:tbl>'
        '<w:tblPr><w:tblW w:w="9000" w:type="dxa"/>'
        '<w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>'
        '</w:tblBorders>'
        '</w:tblPr>'
        + "".join(premises_rows)
        + '</w:tbl>'
    )
    body_parts.append(premises_table)
    body_parts.append(_build_p("", space_after=180))

    # Financial Terms
    body_parts.append(_build_p("3. RENT & SECURITY DEPOSIT TERMS", bold=True, size_pt=13, space_after=100))
    upi_id = property_.payment_upi_id if property_ and property_.payment_upi_id else "karamstay@okhdfcbank"
    finance_rows = [
        _build_table_row("Monthly Agreed Rent", monthly_rent),
        _build_table_row("Refundable Security Deposit", deposit),
        _build_table_row("Monthly Billing Day", f"Day {bill_day} of each calendar month"),
        _build_table_row("Payment UPI / GPay ID", upi_id),
    ]
    finance_table = (
        '<w:tbl>'
        '<w:tblPr><w:tblW w:w="9000" w:type="dxa"/>'
        '<w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>'
        '</w:tblBorders>'
        '</w:tblPr>'
        + "".join(finance_rows)
        + '</w:tbl>'
    )
    body_parts.append(finance_table)
    body_parts.append(_build_p("", space_after=180))

    # Terms & Conditions
    body_parts.append(_build_p("4. STANDARD COVENANTS & CODE OF CONDUCT", bold=True, size_pt=13, space_after=100))
    terms = [
        "4.1 The monthly rent is payable in advance on or before the agreed billing day. Late fees apply per terms.",
        (
            "4.2 The security deposit is refundable at the time of checkout, subject to zero damage deduction and"
            " clearance of dues."
        ),
        (
            "4.3 Either party may terminate this agreement by providing thirty (30) days prior written notice via"
            " the KaramStay portal."
        ),
        (
            "4.4 The tenant covenants to maintain cleanliness, adhere to society rules, avoid sub-letting, and"
            " preserve property fixtures."
        ),
        (
            "4.5 All submitted KYC identification documents and photographs are legally affirmed to be genuine"
            " and accurate."
        ),
    ]
    for term in terms:
        body_parts.append(_build_p(term, size_pt=10, space_after=80))

    body_parts.append(_build_p("", space_after=240))
    body_parts.append(_build_p("5. EXECUTION & SIGNATURES", bold=True, size_pt=13, space_after=140))

    # Signature block table
    tenant_sig_label = (
        '<w:p><w:pPr><w:spacing w:after="400"/></w:pPr>'
        '<w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>Signed by the Tenant:</w:t></w:r></w:p>'
    )
    tenant_sig_name = (
        '<w:p><w:pPr><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr>'
        f'<w:t>{xml_escape(tenant_name)}</w:t></w:r></w:p>'
    )
    owner_sig_label = (
        '<w:p><w:pPr><w:spacing w:after="400"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr>'
        '<w:t>Signed for Landlord / Owner:</w:t></w:r></w:p>'
    )
    owner_sig_name = (
        '<w:p><w:pPr><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr>'
        f'<w:t>{xml_escape(prop_name)} (Authorized Signatory)</w:t></w:r></w:p>'
    )
    sig_rows = [
        '<w:tr>'
        '<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>'
        + tenant_sig_label
        + tenant_sig_name
        + f'<w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Date: {start_date}</w:t></w:r></w:p>'
        '</w:tc>'
        '<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>'
        + owner_sig_label
        + owner_sig_name
        + f'<w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Status: {agreement.status.upper()}</w:t></w:r></w:p>'
        '</w:tc>'
        '</w:tr>'
    ]
    sig_table = (
        '<w:tbl>'
        '<w:tblPr><w:tblW w:w="9000" w:type="dxa"/>'
        '<w:tblBorders>'
        '<w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>'
        '<w:insideH w:val="none"/><w:insideV w:val="none"/>'
        '</w:tblBorders>'
        '</w:tblPr>'
        + "".join(sig_rows)
        + '</w:tbl>'
    )
    body_parts.append(sig_table)
    body_parts.append(_build_p("", space_after=240))

    # 6. Verified Attachments & S3 Vault Archival
    body_parts.append(_build_p("6. VERIFIED ATTACHMENTS & AWS S3 ARCHIVE", bold=True, size_pt=13, space_after=100))
    s3_loc = agreement.s3_folder_path or f"tenants/{tenant_name.replace(' ', '_')}_{tenant.id}/Unit"
    annex_rows = [
        _build_table_row("Tenant Photograph", "Verified & uploaded to AWS S3 vault"),
        _build_table_row("Aadhaar Card / ID Proof", f"Verified ({id_num}) & uploaded to AWS S3 vault"),
        _build_table_row("Digital Signature", "Executed via KaramStay Mobile App"),
        _build_table_row("AWS S3 Vault Location", s3_loc),
    ]
    annex_table = (
        '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>'
        '<w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>'
        '</w:tblBorders></w:tblPr>'
        + "".join(annex_rows)
        + '</w:tbl>'
    )
    body_parts.append(annex_table)

    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:body>'
        + "".join(body_parts)
        + '<w:sectPr>'
        '<w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>'
        '</w:sectPr>'
        '</w:body>'
        '</w:document>'
    )

    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
        '  <Default Extension="xml" ContentType="application/xml"/>\n'
        '  <Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n'
        '</Types>'
    )

    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        '  <Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>\n'
        '</Relationships>'
    )

    # Package into ZIP archive
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("word/document.xml", document_xml)

    return zip_buffer.getvalue()


def build_agreement_pdf(
    agreement: Agreement,
    tenant: Tenant,
    tenancy: Tenancy | None,
    unit: Unit | None,
    property_: Property | None,
    photo_bytes: bytes | None = None,
    aadhar_bytes: bytes | None = None,
    signature_bytes: bytes | None = None,
    offline_doc_items: list[tuple[str, bytes]] | None = None,
) -> bytes:
    """Compile an Agreement into a clean, professional PDF with embedded signatures and KYC/verification annexures."""
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    temp_files: list[str] = []

    def _write_temp_img(raw: bytes, ext: str = "jpg") -> str:
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            tmp.write(raw)
            temp_files.append(tmp.name)
            return tmp.name

    try:
        form_data = agreement.form_data or {}
        tenant_name = form_data.get("full_name") or tenant.name
        id_num = form_data.get("identity_number") or "N/A"
        phone = form_data.get("phone") or tenant.phone
        perm_addr = form_data.get("permanent_address") or "N/A"
        office_addr = form_data.get("office_address") or "N/A"

        prop_name = property_.name if property_ else "KaramStay Residence"
        prop_addr = property_.address if property_ else "Main Street, City"
        unit_str = f"Unit {unit.unit_no}" if unit else "Assigned Room"
        bed_str = f"Bed #{', #'.join(map(str, tenancy.bed_ids))}" if (tenancy and tenancy.bed_ids) else "Private Room"
        monthly_rent = f"INR {tenancy.monthly_rent:,.2f}" if tenancy else "INR 0.00"
        deposit = f"INR {tenancy.security_deposit:,.2f}" if tenancy else "INR 0.00"
        bill_day = str(tenancy.billing_day if tenancy else 1)
        start_date = (
            tenancy.start_date.strftime("%d %B %Y")
            if (tenancy and tenancy.start_date)
            else datetime.now(timezone.utc).strftime("%d %B %Y")
        )

        def clean(s: str) -> str:
            return re.sub(r"[^\x00-\x7F]+", " ", str(s))

        # Header
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, clean("KARAMSTAY RESIDENTIAL LEASE AGREEMENT"), ln=True, align="C")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(
            0,
            6,
            clean(f"Template {agreement.template_id}: {agreement.template_name} | ID: KS-AGR-{agreement.id:06d}"),
            ln=True,
            align="C",
        )
        pdf.cell(0, 6, clean(f"Execution Date: {start_date}"), ln=True, align="C")
        pdf.ln(5)

        # Section 1
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, clean("1. PARTIES & TENANT DETAILS"), ln=True)
        pdf.set_font("Helvetica", "", 10)

        rows = [
            ("Tenant Full Name", tenant_name),
            ("National ID / Aadhaar", id_num),
            ("Contact Phone", phone),
            ("Permanent Address", perm_addr),
            ("Workplace Address", office_addr),
        ]
        for label, val in rows:
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(55, 6, clean(label) + ":", border=0)
            pdf.set_font("Helvetica", "", 10)
            pdf.cell(0, 6, clean(val), ln=True, border=0)

        pdf.ln(4)

        # Section 2
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, clean("2. PROPERTY & ACCOMMODATION ALLOCATION"), ln=True)
        prop_rows = [
            ("Property Name", prop_name),
            ("Property Address", prop_addr),
            ("Room / Unit No.", unit_str),
            ("Bed Allocation", bed_str),
        ]
        for label, val in prop_rows:
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(55, 6, clean(label) + ":", border=0)
            pdf.set_font("Helvetica", "", 10)
            pdf.cell(0, 6, clean(val), ln=True, border=0)

        pdf.ln(4)

        # Section 3
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, clean("3. FINANCIAL COVENANTS"), ln=True)
        fin_rows = [
            ("Monthly Agreed Rent", monthly_rent),
            ("Security Deposit", deposit),
            ("Billing Day", f"Day {bill_day} of each month"),
            (
                "Payment UPI / GPay ID",
                property_.payment_upi_id
                if property_ and property_.payment_upi_id
                else "karamstay@okhdfcbank",
            ),
        ]
        for label, val in fin_rows:
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(55, 6, clean(label) + ":", border=0)
            pdf.set_font("Helvetica", "", 10)
            pdf.cell(0, 6, clean(val), ln=True, border=0)

        pdf.ln(4)

        # Section 4: Rules
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, clean("4. TERMS & NOTICES"), ln=True)
        pdf.set_font("Helvetica", "", 9)
        rules = [
            "- Rent is payable monthly in advance on or before the specified billing day.",
            "- Security deposit is refundable upon move-out subject to damage inspection and zero outstanding dues.",
            "- 30 days prior written notice is required by either party for checkout.",
            "- All submitted KYC photos and identity proofs are verified and archived to AWS S3 vault.",
        ]
        for r in rules:
            pdf.cell(0, 5, clean(r), ln=True)

        pdf.ln(8)

        # Signature Block
        sig_y = pdf.get_y()
        if signature_bytes:
            try:
                sign_file = _write_temp_img(signature_bytes, "png")
                pdf.image(sign_file, x=20, y=sig_y, w=45)
            except Exception as e:
                logger.warning("Could not embed signature in PDF: %s", e)

        pdf.set_y(sig_y + 16 if signature_bytes else sig_y)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(95, 6, clean("Tenant Signature:"), border=0)
        pdf.cell(95, 6, clean("Owner / Manager Signature:"), border=0, ln=True)
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(95, 6, clean(f"Name: {tenant_name}"), border=0)
        pdf.cell(95, 6, clean(f"For: {prop_name}"), border=0, ln=True)
        pdf.cell(95, 6, clean(f"Status: {agreement.status.upper()}"), border=0)
        pdf.cell(95, 6, clean("Archived: AWS S3 Encrypted"), border=0, ln=True)

        # Annexure A: Tenant Photograph and Aadhaar Card
        if photo_bytes or aadhar_bytes:
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 14)
            pdf.cell(0, 10, clean("ANNEXURE A: TENANT PHOTOGRAPH & IDENTIFICATION PROOF"), ln=True, align="C")
            pdf.set_font("Helvetica", "", 10)
            pdf.cell(0, 6, clean(f"Tenant: {tenant_name} | National ID / Aadhaar: {id_num}"), ln=True, align="C")
            pdf.ln(6)

            cur_y = pdf.get_y()
            if photo_bytes:
                try:
                    photo_file = _write_temp_img(photo_bytes, "jpg")
                    pdf.set_font("Helvetica", "B", 10)
                    pdf.set_xy(15, cur_y)
                    pdf.cell(50, 6, clean("Passport / KYC Photo:"), ln=True)
                    pdf.image(photo_file, x=15, y=cur_y + 8, w=45)
                except Exception as e:
                    logger.warning("Could not embed photo in PDF: %s", e)

            if aadhar_bytes:
                try:
                    aadhar_file = _write_temp_img(aadhar_bytes, "jpg")
                    pdf.set_font("Helvetica", "B", 10)
                    pdf.set_xy(70, cur_y)
                    pdf.cell(100, 6, clean("Government Aadhaar / National ID Proof:"), ln=True)
                    pdf.image(aadhar_file, x=70, y=cur_y + 8, w=120)
                except Exception as e:
                    logger.warning("Could not embed Aadhaar in PDF: %s", e)

        # Annexure B: Verification Documents & Legal Exhibits (Stamp Paper, Police Verification, Notary)
        if offline_doc_items:
            for idx, (label, doc_bytes) in enumerate(offline_doc_items):
                if not doc_bytes:
                    continue
                pdf.add_page()
                pdf.set_font("Helvetica", "B", 14)
                pdf.cell(0, 10, clean(f"ANNEXURE B-{idx + 1}: {label.upper()}"), ln=True, align="C")
                pdf.set_font("Helvetica", "", 10)
                pdf.cell(
                    0,
                    6,
                    clean(f"Property: {prop_name} · Room: {unit_str} · Tenant: {tenant_name}"),
                    ln=True,
                    align="C",
                )
                pdf.ln(6)
                try:
                    doc_file = _write_temp_img(doc_bytes, "jpg")
                    pdf.image(doc_file, x=20, y=pdf.get_y() + 4, w=170)
                except Exception as e:
                    logger.warning("Could not embed exhibit %s in PDF: %s", label, e)
                    pdf.cell(0, 10, clean(f"[Exhibit: {label}]"), ln=True, align="C")

        buf = io.BytesIO()
        pdf.output(buf)
        return buf.getvalue()
    finally:
        for p in temp_files:
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass

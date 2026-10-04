"""OpenXML Word (.docx) and PDF Document Generator for KaramStay Agreements.

Generates valid, professional Microsoft Word (.docx) and PDF documents
matching the exact Paying Guest Agreement template with Legal page size,
custom margins, 13 statutory clauses, Caretaker details, and embedded signatures.
"""

import io
import logging
import os
import re
import tempfile
from datetime import date, datetime
from typing import Any

from dateutil.relativedelta import relativedelta
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Inches, Pt
from fpdf import FPDF

try:
    from num2words import num2words
except ImportError:
    num2words = None

from app.features.agreements.models import Agreement
from app.features.properties.models import Property, Unit
from app.features.tenants.models import Tenancy, Tenant

logger = logging.getLogger(__name__)

CARETAKER_NAME = "MR. JASMEET SINGH"
CARETAKER_ADDRESS = (
    "303/B wing, Palatial Heights, Chandivali Farm Rd, Chandivali, Powai, "
    "Mumbai, Maharashtra 400072"
)


def format_date_with_suffix(d: date) -> str:
    """Formats a date object into '04th day of October 2026' style."""
    day = d.day
    if 4 <= day <= 20 or 24 <= day <= 30:
        suffix = "th"
    else:
        suffix = ["st", "nd", "rd"][day % 10 - 1]
    return f"{day:02d}{suffix} day of {d.strftime('%B %Y')}"


def number_to_words_inr(amount: int | float) -> str:
    """Converts a number to Indian Rupee words format."""
    val = int(amount)
    if num2words:
        try:
            return f"Rupees {num2words(val, lang='en_IN').title()} Only"
        except Exception:
            pass
    return f"Rupees {val:,} Only"


def _extract_client_data(
    agreement: Agreement,
    tenant: Tenant,
    tenancy: Tenancy | None,
    unit: Unit | None,
    property_: Property | None,
) -> dict[str, Any]:
    """Extract and normalize all agreement data from form_data and database records."""
    form_data = agreement.form_data or {}

    salutation = form_data.get("salutation") or "Ms"
    first_name = form_data.get("first_name")
    last_name = form_data.get("last_name")

    if not first_name:
        parts = (tenant.name or "Tenant").strip().split()
        first_name = parts[0] if parts else "Tenant"
        last_name = " ".join(parts[1:]) if len(parts) > 1 else ""

    age = str(form_data.get("age") or "25")
    address = (
        form_data.get("address")
        or form_data.get("permanent_address")
        or "Permanent Address"
    )
    state = form_data.get("state") or "Maharashtra"
    permanent_pincode = str(form_data.get("permanent_pincode") or "400001")
    raw_aadhar = form_data.get("aadhar_no") or form_data.get("identity_number") or "Pending KYC"
    aadhar_no = str(raw_aadhar)

    office_address = form_data.get("office_address") or ""
    office_pincode = str(form_data.get("office_pincode") or "")
    email_id = form_data.get("email_id") or tenant.email or ""

    ref1_name = form_data.get("ref1_name") or tenant.emergency_contact_name or "Parent"
    ref1_number = (
        form_data.get("ref1_number")
        or tenant.emergency_contact_phone
        or tenant.phone
        or ""
    )
    ref2_name = form_data.get("ref2_name") or "Guardian"
    ref2_number = form_data.get("ref2_number") or tenant.phone or ""

    default_rented_addr = (
        f"{property_.address}, Room {unit.unit_no}"
        if (property_ and unit)
        else (property_.address if property_ else CARETAKER_ADDRESS)
    )
    rented_address = form_data.get("rented_address") or default_rented_addr

    rent_price = form_data.get("rent_price")
    if not rent_price:
        rent_price = str(int(tenancy.monthly_rent)) if tenancy else "10000"

    security_deposit = form_data.get("security_deposit")
    if not security_deposit:
        security_deposit = str(int(tenancy.security_deposit)) if tenancy else "20000"

    start_date_val = form_data.get("start_date")
    if start_date_val:
        try:
            if "-" in start_date_val:
                tokens = start_date_val.split("-")
                if len(tokens[0]) == 4:
                    start_date_obj = datetime.strptime(start_date_val, "%Y-%m-%d").date()
                else:
                    start_date_obj = datetime.strptime(start_date_val, "%d-%m-%Y").date()
            else:
                start_date_obj = datetime.strptime(start_date_val, "%Y-%m-%d").date()
        except Exception:
            start_date_obj = tenancy.start_date if (tenancy and tenancy.start_date) else date.today()
    elif tenancy and tenancy.start_date:
        start_date_obj = tenancy.start_date
    else:
        start_date_obj = date.today()

    stay_months = int(form_data.get("stay_months") or 11)

    return {
        "salutation": salutation,
        "first_name": first_name,
        "last_name": last_name or "",
        "age": age,
        "address": address,
        "state": state,
        "permanent_pincode": permanent_pincode,
        "aadhar_no": aadhar_no,
        "office_address": office_address,
        "office_pincode": office_pincode,
        "email_id": email_id,
        "ref1_name": ref1_name,
        "ref1_number": ref1_number,
        "ref2_name": ref2_name,
        "ref2_number": ref2_number,
        "rented_address": rented_address,
        "rent_price": str(rent_price),
        "security_deposit": str(security_deposit),
        "start_date": start_date_obj,
        "stay_months": stay_months,
    }


def build_agreement_docx(
    agreement: Agreement,
    tenant: Tenant,
    tenancy: Tenancy | None,
    unit: Unit | None,
    property_: Property | None,
    signature_bytes: bytes | None = None,
) -> bytes:
    """Compile an Agreement into a valid OpenXML Word Document (.docx)

    matching the exact Paying Guest Details Form and Word structure from main.py.
    """
    client_data = _extract_client_data(agreement, tenant, tenancy, unit, property_)

    doc = Document()

    # --- PAGE 1 SETUP (LEGAL Size with Left Margin) ---
    section_page1 = doc.sections[0]
    section_page1.page_height = Inches(14.0)
    section_page1.page_width = Inches(8.5)
    section_page1.left_margin = Cm(3.0)
    section_page1.right_margin = Cm(1.5)

    def add_paragraph_with_runs(texts_and_formats, alignment=WD_ALIGN_PARAGRAPH.JUSTIFY, font_size=16):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(6)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.alignment = alignment
        for text, is_bold in texts_and_formats:
            run = p.add_run(text)
            run.font.name = "Times New Roman"
            run.font.size = Pt(font_size)
            run.bold = is_bold
        return p

    def add_formatted_paragraph(text, size=16, bold=False, align=WD_ALIGN_PARAGRAPH.JUSTIFY):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.alignment = align
        run = p.add_run(text)
        run.font.name = "Times New Roman"
        run.font.size = Pt(size)
        run.bold = bold
        return p

    start_date = client_data["start_date"]
    stay_months = client_data["stay_months"]

    next_month_date = start_date + relativedelta(months=+stay_months)
    first_day_of_next_month = next_month_date.replace(day=1)
    end_date = first_day_of_next_month - relativedelta(days=1)

    start_date_str = format_date_with_suffix(start_date)
    end_date_str = format_date_with_suffix(end_date)

    first_n = client_data["first_name"]
    last_n = client_data["last_name"]
    full_name = f"{first_n} {last_n}".strip() if last_n else first_n

    full_address = f"{client_data['address']}, {client_data['state']} - {client_data['permanent_pincode']}"

    rent_val = int(float(client_data["rent_price"]))
    deposit_val = int(float(client_data["security_deposit"]))
    rent_in_words = number_to_words_inr(rent_val)
    deposit_in_words = number_to_words_inr(deposit_val)

    # --- PAGE 1 (Legal Size, Content at Bottom) ---
    for _ in range(17):
        doc.add_paragraph()

    add_formatted_paragraph("PAYING GUEST AGREEMENT", size=20, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    doc.add_paragraph()

    add_paragraph_with_runs([
        ("THIS AGREEMENT is made and entered in to at Mumbai this ", False),
        (f"{start_date_str} BETWEEN: {CARETAKER_NAME}", True),
        (", residing at ", False),
        (CARETAKER_ADDRESS, True),
        (", Hereinafter referred to as ", False),
        ("“CARETAKER”", True),
        (" (which expression shall mean and include his heirs, executors, administrators and assigns) of the ", False),
        ("ONE PART", True),
    ], font_size=16, alignment=WD_ALIGN_PARAGRAPH.JUSTIFY)

    doc.add_page_break()

    # --- SET SUBSEQUENT PAGES TO LEGAL SIZE (with Left Margin) ---
    legal_section = doc.sections[-1]
    legal_section.page_height = Inches(14.0)
    legal_section.page_width = Inches(8.5)
    legal_section.left_margin = Cm(3.0)
    legal_section.right_margin = Cm(1.5)

    # --- PAGE 2 & 3 (Legal Size, Font Size 14) ---
    add_formatted_paragraph("AND", size=14, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)

    font_size_main = Pt(14)
    p_details = doc.add_paragraph()
    p_details.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_details.paragraph_format.space_before = Pt(12)
    p_details.paragraph_format.space_after = Pt(0)

    def add_run_to_details(text, bold=False):
        run = p_details.add_run(text)
        run.font.name = "Times New Roman"
        run.font.size = font_size_main
        run.bold = bold

    salutation_display = client_data["salutation"].strip()
    if not salutation_display.endswith("."):
        salutation_display += "."

    add_run_to_details(f"{salutation_display} ", bold=True)
    add_run_to_details(full_name, bold=True)
    add_run_to_details(f", aged {client_data['age']} years, an adult, ")
    add_run_to_details("Indian Inhabitant permanently residing at: ")
    add_run_to_details(full_address, bold=True)
    add_run_to_details(" Having Aadhar card No. ")
    add_run_to_details(client_data["aadhar_no"], bold=True)
    add_run_to_details("\n")

    add_run_to_details("Emergency Contact:\n")
    add_run_to_details("(1) ")
    add_run_to_details(client_data["ref1_name"], bold=True)
    add_run_to_details(" Ph- ")
    add_run_to_details(client_data["ref1_number"], bold=True)
    add_run_to_details("\n")
    add_run_to_details("(2) ")
    add_run_to_details(client_data["ref2_name"], bold=True)
    add_run_to_details(" Ph- ")
    add_run_to_details(client_data["ref2_number"], bold=True)
    add_run_to_details("\n")

    office_address = client_data.get("office_address")
    if office_address:
        office_pincode = client_data.get("office_pincode", "")
        full_office_address = f"{office_address}, {office_pincode}".strip().strip(",")
        add_run_to_details("Office Address: ")
        add_run_to_details(full_office_address, bold=True)
        add_run_to_details("\n")

    email_id = client_data.get("email_id")
    if email_id:
        add_run_to_details("Email ID: ")
        add_run_to_details(email_id, bold=True)
        add_run_to_details("\n")

    p_last = doc.add_paragraph()
    p_last.paragraph_format.space_before = Pt(0)
    p_last.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p_last.add_run("Hereinafter referred to as the ").font.size = font_size_main
    run = p_last.add_run("“PAYING GUEST” ")
    run.bold = True
    run.font.size = font_size_main
    p_last.add_run(
        "(which expression shall mean and include his heirs, executors, administrators and assigns) of the "
    ).font.size = font_size_main
    run = p_last.add_run("SECOND PART.")
    run.bold = True
    run.font.size = font_size_main
    for r in p_last.runs:
        r.font.name = "Times New Roman"

    add_paragraph_with_runs([
        ("WHEREAS", True),
        (" the party of the one Part is the Host in respect of premises situate at ", False),
        (client_data["rented_address"], True),
        (", hereinafter for the sake of brevity referred to as the “Said Room Premises”.", False),
    ], font_size=14)

    add_paragraph_with_runs([
        ("AND WHEREAS", True),
        (
            " the Paying Guests are in need of temporary furnished accommodation and has approached and requested "
            "to the owner to permit the said Paying Guest the use of the “Said Room Premises” together with the "
            "fixtures, fittings, furniture’s and amenities for residential purposes for a temporary period. "
            "AND WHEREAS, the Host has agreed on certain terms and conditions which the parties have mutually agreed "
            "themselves as under.",
            False,
        ),
    ], font_size=14)
    doc.add_paragraph()

    clauses = [
        [
            (
                "The Host has permitted the Paying Guest the Use of part bathrooms in the “Said room Premises” "
                "situated at ",
                False,
            ),
            (client_data["rented_address"], True),
            (
                " together with fixtures, fittings, furniture and amenities for the purpose of providing temporary "
                "residential accommodation on paying guest basis.",
                False,
            ),
        ],
        [
            ("This Agreement shall be on monthly basis commencing from ", False),
            (start_date_str, True),
            (" to ", False),
            (end_date_str, True),
        ],
        [
            (
                "The Paying Guest shall pay the monthly rent between the 1st and 5th day of every month. Any delay "
                "beyond the 5th day shall attract a late payment charge of ₹200 (Rupees Two Hundred) per day until "
                "the rent is cleared. Upon vacating the “Said Room Premises,” a sum of ₹500 (Rupees Five Hundred) "
                "shall be deducted from the Security Deposit towards room cleaning charges, and the remaining "
                "balance of the deposit, if any, shall be refunded after adjustment of all dues or damages, if "
                "applicable.",
                True,
            )
        ],
        [
            ("That the Paying Guest shall pay ", False),
            (f"Rs. {deposit_val}:/- ({deposit_in_words})", True),
            (
                " as a refundable security deposit amount to the Caretaker. which will be returned to the Paying Guest "
                "on vacating the “ Said Room Premises” for which ",
                False,
            ),
            ("ONE MONTH", True),
            (" notice is required.", False),
        ],
        [
            ("That the Paying Guest shall pay to the caretaker of ", False),
            (f"Rs. {rent_val}:/- ({rent_in_words})", True),
            (
                " towards the compensation charges for the use of the “Said Room Premises” together with the use of "
                "the fixtures, fittings, furniture and amenities and which is not including Electricity Charges "
                "(actual) to be shared by all PG’s as also maid charges.",
                False,
            ),
        ],
        [
            (
                "The Paying Guest shall keep the “Said Room Premises” in good condition and comply with all the rules "
                "and regulations required in this regard.",
                False,
            ),
        ],
        [
            ("The paying Guest shall not carry out any addition or alterations in the “Said Room Premises”.", False),
        ],
        [
            (
                "The “Said Room Premises” shall be used by the Paying Guest Only for lawful purpose of residential "
                "stay. The said premises shall not be used for any other purpose/s by the Paying Guest. The Caretaker "
                "shall restrain the access to the “Said Room Premises” if the paying guest misuses the premises or "
                "commits any illegal act or criminal act or disturbs the neighbors or the society.",
                False,
            ),
        ],
        [
            (
                "The Paying Guest hereby covenants and agrees that they shall not use the address of the “Said Room "
                "Premises” for obtaining, applying for, or registering any government-issued identification, "
                "documentation, or services, including but not limited to: Ration Card, Gas Connection, Aadhaar Card, "
                "PAN Card, Voter ID Card, Driving License, Bank Loan or Online Loan documentation, Any other "
                "government-recognized proof of residence.",
                False,
            ),
        ],
        [
            (
                "The paying guest shall not bring any visitors to the premises except with the permission of "
                "the Caretaker.",
                False,
            ),
        ],
        [
            (
                "The Caretaker of his representatives shall have the lock and key of the “Said Room Premises” and "
                "have the right to enter the said room for the purpose of inspection or any other purpose/s at all "
                "reasonable hours.",
                False,
            ),
        ],
        [
            (
                "The Notice period for termination of this paying guest by either party is ONE MONTH. (The paying "
                "Guest have no right to vacate the said premises before 3 months from the commencing of this "
                "agreement) .(i.e. 3 months locking period)",
                False,
            ),
        ],
        [
            (
                "This agreement does not bestow any right, title, possession or interest of whatsoever nature in "
                "the Room / Flat to the Paying Guest.",
                False,
            ),
        ],
    ]

    for i, clause_parts in enumerate(clauses):
        p = doc.add_paragraph(style="List Number")
        p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.space_after = Pt(0)

        # Page break before the 4th point (index 3)
        if i == 3:
            p.paragraph_format.page_break_before = True

        for text, is_bold in clause_parts:
            run = p.add_run(text)
            run.font.name = "Times New Roman"
            run.font.size = Pt(14)
            run.bold = is_bold

        if i != 12:
            doc.add_paragraph()

    # --- SIGNATURE BLOCK ---
    signature_page_section = doc.sections[-1]
    signature_page_section.left_margin = Cm(3.0)
    signature_page_section.right_margin = Cm(1.5)

    add_formatted_paragraph(
        "IN WITNESS WHEREOF the parties have hereto hereinto set their respective hands on the day and year first "
        "hereinabove mentioned.",
        size=14,
    )
    for _ in range(3):
        doc.add_paragraph()

    add_paragraph_with_runs([
        ("SIGNED AND DELIVERED for\nThe Caretaker by withinnamed\n", False),
        ("Mr. Jasmeet Singh", True),
    ], alignment=WD_ALIGN_PARAGRAPH.LEFT, font_size=14)

    doc.add_paragraph()
    add_formatted_paragraph("In the presence of ………………….", size=14, align=WD_ALIGN_PARAGRAPH.LEFT)

    for _ in range(5):
        doc.add_paragraph()

    add_paragraph_with_runs([
        ("SIGNED AND DELIVERED for\nThe paying Guest by withinnamed\n", False),
        (f"{salutation_display} ", True),
        (full_name, True),
    ], alignment=WD_ALIGN_PARAGRAPH.LEFT, font_size=14)

    if signature_bytes:
        try:
            sig_p = doc.add_paragraph()
            sig_run = sig_p.add_run()
            sig_run.add_picture(io.BytesIO(signature_bytes), width=Inches(2.0))
            sig_p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        except Exception as e:
            logger.warning("Could not embed signature in docx: %s", e)

    add_formatted_paragraph("In the presence of ………………….", size=14, align=WD_ALIGN_PARAGRAPH.LEFT)

    document_stream = io.BytesIO()
    doc.save(document_stream)
    return document_stream.getvalue()


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
    """Compile an Agreement into a clean, professional PDF matching the Paying Guest Agreement terms

    with embedded signatures, tenant photograph, Aadhaar card, and offline verification annexures.
    """
    client_data = _extract_client_data(agreement, tenant, tenancy, unit, property_)

    start_date = client_data["start_date"]
    stay_months = client_data["stay_months"]
    next_month_date = start_date + relativedelta(months=+stay_months)
    first_day_of_next_month = next_month_date.replace(day=1)
    end_date = first_day_of_next_month - relativedelta(days=1)

    start_date_str = format_date_with_suffix(start_date)
    end_date_str = format_date_with_suffix(end_date)

    first_n = client_data["first_name"]
    last_n = client_data["last_name"]
    full_name = f"{first_n} {last_n}".strip() if last_n else first_n
    full_address = f"{client_data['address']}, {client_data['state']} - {client_data['permanent_pincode']}"

    rent_val = int(float(client_data["rent_price"]))
    deposit_val = int(float(client_data["security_deposit"]))
    rent_in_words = number_to_words_inr(rent_val)
    deposit_in_words = number_to_words_inr(deposit_val)

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    temp_files: list[str] = []

    def _write_temp_img(raw: bytes, ext: str = "jpg") -> str:
        try:
            from PIL import Image as PILImage

            img = PILImage.open(io.BytesIO(raw))
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGB")
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                img.save(tmp, format="JPEG", quality=90)
                temp_files.append(tmp.name)
                return tmp.name
        except Exception:
            pass
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            tmp.write(raw)
            temp_files.append(tmp.name)
            return tmp.name

    def clean(s: str) -> str:
        return re.sub(r"[^\x00-\x7F]+", " ", str(s))

    try:
        # Title
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, clean("PAYING GUEST AGREEMENT"), ln=True, align="C")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(
            0,
            6,
            clean(f"Agreement ID: KS-AGR-{agreement.id:06d} | Date: {start_date_str}"),
            ln=True,
            align="C",
        )
        pdf.ln(4)

        # Caretaker & Host Party
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 6, clean("PARTIES TO THE AGREEMENT:"), ln=True)
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(
            0,
            5,
            clean(
                f"THIS AGREEMENT is made and entered into at Mumbai this {start_date_str} BETWEEN: {CARETAKER_NAME}, "
                f"residing at {CARETAKER_ADDRESS}, Hereinafter referred to as “CARETAKER” of the ONE PART,"
            ),
        )
        pdf.ln(2)

        # Paying Guest Party
        salutation_display = client_data["salutation"].strip()
        if not salutation_display.endswith("."):
            salutation_display += "."

        pg_desc = (
            f"AND {salutation_display} {full_name}, aged {client_data['age']} years, an adult, Indian Inhabitant "
            f"permanently residing at: {full_address}, Having Aadhar card No. {client_data['aadhar_no']}.\n"
            f"Emergency Contact: (1) {client_data['ref1_name']} Ph- {client_data['ref1_number']} | "
            f"(2) {client_data['ref2_name']} Ph- {client_data['ref2_number']}.\n"
        )
        if client_data.get("office_address"):
            pg_desc += (
                f"Office Address: {client_data['office_address']}, {client_data.get('office_pincode', '')}\n"
            )
        if client_data.get("email_id"):
            pg_desc += f"Email ID: {client_data['email_id']}\n"
        pg_desc += "Hereinafter referred to as the “PAYING GUEST” of the SECOND PART."

        pdf.multi_cell(0, 5, clean(pg_desc))
        pdf.ln(3)

        # Premises & Terms
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 6, clean("TERMS & CONDITIONS:"), ln=True)
        pdf.set_font("Helvetica", "", 8.5)

        clauses_pdf = [
            (
                f"1. The Host has permitted the Paying Guest the use of part bathrooms in the premises situated at "
                f"{client_data['rented_address']} together with fixtures, fittings, and amenities for temporary "
                f"residential accommodation on PG basis."
            ),
            f"2. This Agreement shall be on monthly basis commencing from {start_date_str} to {end_date_str}.",
            (
                "3. The Paying Guest shall pay the monthly rent between the 1st and 5th day of every month. "
                "Any delay beyond the 5th day attracts a late fee of Rs. 200/day. Room cleaning charge of Rs. 500 "
                "will be deducted from security deposit upon vacating."
            ),
            (
                f"4. The Paying Guest shall pay Rs. {deposit_val}:/- ({deposit_in_words}) as refundable security "
                f"deposit to Caretaker, returned on vacating with ONE MONTH notice."
            ),
            (
                f"5. The Paying Guest shall pay monthly rent of Rs. {rent_val}:/- ({rent_in_words}) towards "
                f"compensation charges (excluding actual electricity shared by all PGs and maid charges)."
            ),
            (
                "6. The Paying Guest shall keep the premises in good condition and comply with all society rules "
                "and regulations."
            ),
            "7. The Paying Guest shall not carry out any additions or alterations in the premises.",
            (
                "8. The premises shall be used only for lawful residential purposes. Misuse or disturbance empowers "
                "Caretaker to restrain access."
            ),
            (
                "9. The Paying Guest covenants not to use the premises address for registering any government-issued "
                "ID proof, ration card, loan, or permanent residence document."
            ),
            "10. The Paying Guest shall not bring visitors to the premises except with permission of the Caretaker.",
            (
                "11. Caretaker or representatives shall retain duplicate lock and key and have right of inspection at "
                "all reasonable hours."
            ),
            (
                "12. Notice period for termination is ONE MONTH. "
                "Mandatory 3 months lock-in period applies from commencement."
            ),
            "13. This agreement does not bestow any right, title, possession, or tenancy interest to the Paying Guest.",
        ]

        for c_text in clauses_pdf:
            pdf.multi_cell(0, 4.5, clean(c_text))
            pdf.ln(1)

        pdf.ln(4)

        # Signatures
        sig_y = pdf.get_y()
        if signature_bytes:
            try:
                sign_file = _write_temp_img(signature_bytes, "png")
                pdf.image(sign_file, x=20, y=sig_y, w=45)
            except Exception as e:
                logger.warning("Could not embed signature in PDF: %s", e)

        pdf.set_y(sig_y + 16 if signature_bytes else sig_y)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(95, 6, clean("For Caretaker:"), border=0)
        pdf.cell(95, 6, clean(f"Paying Guest: {salutation_display} {full_name}"), border=0, ln=True)
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(95, 6, clean("Mr. Jasmeet Singh"), border=0)
        pdf.cell(95, 6, clean(f"Aadhaar: {client_data['aadhar_no']}"), border=0, ln=True)
        pdf.cell(95, 6, clean(f"Status: {agreement.status.upper()}"), border=0)
        pdf.cell(95, 6, clean(f"Date: {start_date_str}"), border=0, ln=True)

        # Annexure A: Tenant Photograph & Aadhaar Card
        if photo_bytes or aadhar_bytes:
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 14)
            pdf.cell(0, 10, clean("ANNEXURE A: TENANT PHOTOGRAPH & AADHAAR CARD"), ln=True, align="C")
            pdf.set_font("Helvetica", "", 10)
            pdf.cell(
                0,
                6,
                clean(f"Tenant: {salutation_display} {full_name} | Aadhaar No: {client_data['aadhar_no']}"),
                ln=True,
                align="C",
            )
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
                    pdf.cell(100, 6, clean("Aadhaar Card Proof:"), ln=True)
                    pdf.image(aadhar_file, x=70, y=cur_y + 8, w=120)
                except Exception as e:
                    logger.warning("Could not embed Aadhaar in PDF: %s", e)

        # Annexure B: Stamp Paper Pages / Executed Agreement Scans
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
                    clean(f"Premises: {client_data['rented_address']} · Tenant: {full_name}"),
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

        try:
            out = pdf.output()
            if isinstance(out, bytes | bytearray):
                return bytes(out)
        except TypeError:
            pass
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

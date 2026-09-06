from datetime import datetime
from decimal import Decimal

try:
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos
except ImportError:
    FPDF = None  # type: ignore
    XPos = None  # type: ignore
    YPos = None  # type: ignore


def generate_receipt_pdf(
    *,
    receipt_no: str,
    tenant_name: str,
    unit_label: str,
    amount: Decimal,
    payment_mode: str,
    paid_at: datetime,
) -> bytes:
    if FPDF is None:
        content = (
            f"KaramStay Payment Receipt\n"
            f"Receipt No: {receipt_no}\n"
            f"Date: {paid_at.strftime('%d %b %Y %H:%M')}\n"
            f"Tenant: {tenant_name}\n"
            f"Unit: {unit_label}\n"
            f"Amount Paid: Rs. {amount:,.2f}\n"
            f"Payment Mode: {payment_mode}\n"
        )
        return content.encode("utf-8")

    pdf = FPDF(format="A4")
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 12, "KaramStay", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 8, "Payment Receipt", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(6)

    pdf.set_font("Helvetica", "", 11)
    rows = [
        ("Receipt No.", receipt_no),
        ("Date", paid_at.strftime("%d %b %Y %H:%M")),
        ("Tenant", tenant_name),
        ("Unit", unit_label),
        ("Amount Paid", f"Rs. {amount:,.2f}"),
        ("Payment Mode", payment_mode),
    ]
    for label, value in rows:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(45, 8, label)
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(0, 8, str(value), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 9)
    pdf.cell(0, 6, "This is a system-generated receipt.", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    return bytes(pdf.output())

import csv
import io
from typing import Any

from fastapi import Response
try:
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos
except ImportError:
    FPDF = None  # type: ignore
    XPos = None  # type: ignore
    YPos = None  # type: ignore


def rows_to_csv(rows: list[dict[str, Any]]) -> bytes:
    if not rows:
        return b""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def rows_to_pdf(title: str, rows: list[dict[str, Any]]) -> bytes:
    if FPDF is None:
        return rows_to_csv(rows)
    pdf = FPDF(orientation="L", format="A4")
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)

    if not rows:
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(0, 8, "No data.", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        return bytes(pdf.output())

    headers = list(rows[0].keys())
    col_width = 270 / len(headers)
    pdf.set_font("Helvetica", "B", 9)
    for header in headers:
        pdf.cell(col_width, 8, str(header), border=1)
    pdf.ln(8)
    pdf.set_font("Helvetica", "", 9)
    for row in rows:
        for header in headers:
            pdf.cell(col_width, 8, str(row.get(header, "")), border=1)
        pdf.ln(8)
    return bytes(pdf.output())


def build_export_response(*, export_format: str, title: str, rows: list[dict[str, Any]]) -> Response | None:
    if export_format == "csv":
        return Response(
            content=rows_to_csv(rows),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{title}.csv"'},
        )
    if export_format == "pdf":
        return Response(
            content=rows_to_pdf(title, rows),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{title}.pdf"'},
        )
    return None

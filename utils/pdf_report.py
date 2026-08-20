"""
pdf_report.py
--------------
Generates a downloadable PDF report for a single prediction, including
the uploaded image, prediction outcome, confidence, model used, timestamp,
and a plain-language explainability summary. Uses reportlab (pure-Python,
no external binary dependency, Docker/AWS friendly).
"""

import io
import cv2
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from utils.config import APP_NAME
from utils.logger import get_logger

logger = get_logger(__name__)


def generate_prediction_report(result: dict, original_image, user_email: str) -> bytes:
    """
    result: the dict returned by SignaturePredictor.predict(), optionally
            merged with an "explanation_summary" key from the Explainer.
    original_image: BGR numpy array (as loaded from upload)
    Returns: PDF file content as bytes, ready for st.download_button.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleCustom", parent=styles["Title"], textColor=colors.HexColor("#4338CA"))
    heading_style = ParagraphStyle("HeadingCustom", parent=styles["Heading2"], textColor=colors.HexColor("#312E81"))

    elements = []
    elements.append(Paragraph(f"{APP_NAME} — Signature Analysis Report", title_style))
    elements.append(Spacer(1, 0.3 * cm))
    elements.append(Paragraph(f"Generated for: {user_email}", styles["Normal"]))
    elements.append(Paragraph(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles["Normal"]))
    elements.append(Spacer(1, 0.5 * cm))

    # ---- Uploaded image -----------------------------------------------------
    img_rgb = cv2.cvtColor(original_image, cv2.COLOR_BGR2RGB)
    ok, buf = cv2.imencode(".png", cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR))
    if ok:
        img_stream = io.BytesIO(buf.tobytes())
        elements.append(Paragraph("Uploaded Signature", heading_style))
        elements.append(RLImage(img_stream, width=8 * cm, height=5.5 * cm))
        elements.append(Spacer(1, 0.5 * cm))

    # ---- Prediction summary table ------------------------------------------------
    elements.append(Paragraph("Prediction Summary", heading_style))
    data = [
        ["Field", "Value"],
        ["Prediction", result.get("prediction", "N/A")],
        ["Confidence", f"{result.get('confidence', 0)}%"],
        ["Model Used", result.get("model_used", "N/A").replace("_", " ").title()],
        ["Prediction Time", f"{result.get('prediction_time_ms', 0)} ms"],
    ]
    table = Table(data, colWidths=[5 * cm, 9 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4338CA")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 0.5 * cm))

    # ---- Explainability summary --------------------------------------------------
    elements.append(Paragraph("Explainable AI Summary", heading_style))
    explanation = result.get("explanation_summary", "No explanation available.")
    elements.append(Paragraph(explanation, styles["Normal"]))
    elements.append(Spacer(1, 0.3 * cm))

    top_features = result.get("top_features", [])
    if top_features:
        feat_data = [["Feature", "Contribution"]] + [
            [name.replace("_", " ").title(), f"{value:+.4f}"] for name, value in top_features
        ]
        feat_table = Table(feat_data, colWidths=[9 * cm, 5 * cm])
        feat_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#6366F1")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
        ]))
        elements.append(feat_table)

    elements.append(Spacer(1, 0.8 * cm))
    elements.append(Paragraph(
        "This report was generated automatically by ForgeXplain's explainable AI pipeline. "
        "Results should be used as a decision-support tool alongside expert forensic review.",
        ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8, textColor=colors.grey),
    ))

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    logger.info("Generated PDF report (%d bytes) for %s", len(pdf_bytes), user_email)
    return pdf_bytes

import os
from datetime import datetime
from pathlib import Path
from PyQt6.QtWidgets import QFileDialog
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.enums import TA_LEFT, TA_CENTER


def export_meeting(parent_widget, title: str, transcript: str, summary: str = ""):
    """Export meeting transcript and summary as PDF or TXT."""

    if not transcript:
        return False, "No transcript to export"

    # Show file dialog
    file_dialog = QFileDialog(parent_widget)
    file_dialog.setDefaultSuffix("pdf")
    file_dialog.setNameFilters(["PDF Files (*.pdf)", "Text Files (*.txt)"])

    if file_dialog.exec() != QFileDialog.DialogCode.Accepted:
        return False, "Export cancelled"

    file_path = file_dialog.selectedFiles()[0]
    file_ext = os.path.splitext(file_path)[1].lower()

    try:
        if file_ext == ".pdf":
            _export_as_pdf(file_path, title, transcript, summary)
        else:
            _export_as_text(file_path, title, transcript, summary)
        return True, f"Exported to {os.path.basename(file_path)}"
    except Exception as e:
        return False, f"Export failed: {str(e)}"


def _export_as_text(file_path: str, title: str, transcript: str, summary: str):
    """Export meeting as plain text file."""
    content = f"""MEETING TRANSCRIPT
{'=' * 60}

Title: {title}
Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

{'=' * 60}

TRANSCRIPT
{'-' * 60}
{transcript}
"""

    if summary:
        content += f"""

AI SUMMARY
{'-' * 60}
{summary}
"""

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)


def _export_as_pdf(file_path: str, title: str, transcript: str, summary: str):
    """Export meeting as PDF file."""
    doc = SimpleDocTemplate(
        file_path,
        pagesize=letter,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch
    )

    styles = getSampleStyleSheet()
    story = []

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor='#1e293b',
        spaceAfter=6,
        alignment=TA_CENTER
    )
    story.append(Paragraph(f"Meeting: {title}", title_style))

    # Metadata
    meta_style = ParagraphStyle(
        'Meta',
        parent=styles['Normal'],
        fontSize=9,
        textColor='#64748b',
        spaceAfter=12,
        alignment=TA_CENTER
    )
    story.append(Paragraph(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", meta_style))
    story.append(Spacer(1, 0.2*inch))

    # Transcript section
    transcript_header = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor='#1e293b',
        spaceAfter=6,
        spaceBefore=6
    )
    story.append(Paragraph("TRANSCRIPT", transcript_header))

    transcript_style = ParagraphStyle(
        'TranscriptText',
        parent=styles['BodyText'],
        fontSize=11,
        spaceAfter=12,
        alignment=TA_LEFT
    )
    story.append(Paragraph(transcript, transcript_style))

    # Summary section (if available)
    if summary:
        story.append(Spacer(1, 0.2*inch))
        story.append(PageBreak())
        story.append(Paragraph("AI SUMMARY", transcript_header))
        story.append(Paragraph(summary, transcript_style))

    # Build PDF
    doc.build(story)

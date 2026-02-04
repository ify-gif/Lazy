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
            _export_as_pdf(file_path, "Meeting Transcript", title, transcript, summary)
        else:
            _export_as_text(file_path, "Meeting Transcript", title, transcript, summary)
        return True, f"Exported to {os.path.basename(file_path)}"
    except Exception as e:
        return False, f"Export failed: {str(e)}"


def export_story_file(parent_widget, story_data: dict):
    """Export work story data as PDF or TXT."""
    if not story_data.get('overview') and not story_data.get('description'):
        return False, "No content to export"

    title = story_data.get('title', 'Untitled Story')
    
    # Show file dialog
    file_dialog = QFileDialog(parent_widget)
    file_dialog.setDefaultSuffix("pdf")
    file_dialog.setNameFilters(["PDF Files (*.pdf)", "Text Files (*.txt)"])
    file_dialog.selectFile(f"{title}.pdf")

    if file_dialog.exec() != QFileDialog.DialogCode.Accepted:
        return False, "Export cancelled"

    file_path = file_dialog.selectedFiles()[0]
    file_ext = os.path.splitext(file_path)[1].lower()

    # Prepare story content
    summary_content = f"### SUMMARY: {title}\n\n---\n\n#### DESCRIPTION:\n{story_data.get('description', '')}"
    
    comments = story_data.get('comments', [])
    if comments:
        summary_content += "\n\n---\n\n#### COMMENTS:\n" + "\n".join([f"- {c}" for c in comments])

    try:
        if file_ext == ".pdf":
            _export_as_pdf(file_path, "User Story / Technical Brief", title, story_data.get('overview', ''), summary_content)
        else:
            _export_as_text(file_path, "User Story / Technical Brief", title, story_data.get('overview', ''), summary_content)
        return True, f"Exported to {os.path.basename(file_path)}"
    except Exception as e:
        return False, f"Export failed: {str(e)}"


def _export_as_text(file_path: str, type_label: str, title: str, transcript: str, summary: str):
    """Export as plain text file."""
    content = f"""{type_label.upper()}
{'=' * 60}

Title: {title}
Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

{'=' * 60}

AI GENERATED CONTENT
{'-' * 60}
{summary}

{'-' * 60}

RAW TRANSCRIPT / OVERVIEW
{'-' * 60}
{transcript}
"""

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)


def _export_as_pdf(file_path: str, type_label: str, title: str, transcript: str, summary: str):
    """Export as PDF file."""
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

    # Type Label
    label_style = ParagraphStyle(
        'TypeLabel',
        parent=styles['Normal'],
        fontSize=10,
        textColor='#64748b',
        spaceAfter=2,
        alignment=TA_CENTER
    )
    story.append(Paragraph(type_label, label_style))

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor='#1e293b',
        spaceAfter=6,
        alignment=TA_CENTER
    )
    story.append(Paragraph(title, title_style))

    # Metadata
    meta_style = ParagraphStyle(
        'Meta',
        parent=styles['Normal'],
        fontSize=9,
        textColor='#64748b',
        spaceAfter=12,
        alignment=TA_CENTER
    )
    story.append(Paragraph(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", meta_style))
    story.append(Spacer(1, 0.2*inch))

    # Summary section (Story/Meeting Brief)
    header_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor='#1e293b',
        spaceAfter=10,
        spaceBefore=10
    )
    
    body_style = ParagraphStyle(
        'BodyText',
        parent=styles['BodyText'],
        fontSize=11,
        spaceAfter=12,
        alignment=TA_LEFT,
        leading=14
    )

    if summary:
        story.append(Paragraph("AI GENERATED BRIEF", header_style))
        # Convert markdown headings to bold, then newlines to <br/>
        import re
        safe_summary = re.sub(r'#{2,4}\s+(.+)', r'<b>\1</b>', summary)
        safe_summary = safe_summary.replace("---", "").replace("\n", "<br/>")
        story.append(Paragraph(safe_summary, body_style))
        story.append(PageBreak())

    # Transcript section
    story.append(Paragraph("RAW TRANSCRIPT / DATA", header_style))
    story.append(Paragraph(transcript.replace("\n", "<br/>"), body_style))

    # Build PDF
    doc.build(story)

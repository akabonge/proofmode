import io
from datetime import datetime

from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas


def _wrap(text: str, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""

    for word in words:
        candidate = (cur + " " + word).strip()
        if len(candidate) <= width:
            cur = candidate
        else:
            if cur:
                lines.append(cur)
            cur = word

    if cur:
        lines.append(cur)

    return lines


def _new_page(c: canvas.Canvas, page_height: float) -> float:
    c.showPage()
    c.setFont("Helvetica", 10)
    return page_height - 72


def _pretty_label(key: str) -> str:
    return key.replace("_", " ").strip().capitalize()


def build_proof_pdf(
    title: str,
    course: str | None,
    assignment_label: str,
    created_at: datetime,
    integrity_hash: str,
    student_name: str | None = None,
    assignment_prompt: str | None = None,
    evidence_summary: dict | None = None,
    checkpoints: list[dict] | None = None,
    final_reflections: dict | None = None,
) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=LETTER)
    _, page_height = LETTER
    y = page_height - 72

    c.setTitle("ProofMode Proof")
    c.setFont("Helvetica-Bold", 20)
    c.drawString(72, y, "ProofMode")
    c.setFont("Helvetica", 11)
    c.drawRightString(540, y, "Proof of Process")
    y -= 28

    c.setFont("Helvetica-Bold", 15)
    c.drawString(72, y, title)
    y -= 18

    c.setFont("Helvetica", 10)
    meta = [
        f"Assignment mode: {assignment_label}",
        f"Generated: {created_at.strftime('%Y-%m-%d %H:%M UTC')}",
    ]

    if course:
        meta.insert(1, f"Course: {course}")
    if student_name:
        meta.insert(0, f"Student: {student_name}")

    for item in meta:
        c.drawString(72, y, item)
        y -= 12

    if assignment_prompt:
        y -= 8
        c.setFont("Helvetica-Bold", 12)
        c.drawString(72, y, "Assignment prompt")
        y -= 16
        c.setFont("Helvetica", 10)
        for line in _wrap(assignment_prompt, 95)[:12]:
            if y < 96:
                y = _new_page(c, page_height)
            c.drawString(72, y, line)
            y -= 12

    if evidence_summary:
        y -= 8
        if y < 140:
            y = _new_page(c, page_height)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(72, y, "Evidence summary")
        y -= 18
        c.setFont("Helvetica", 10)

        summary_lines = [
            f"Checkpoints captured: {evidence_summary.get('checkpoint_count', 0)}",
            f"Active writing days: {evidence_summary.get('active_days', 0)}",
            f"Timespan: {evidence_summary.get('timespan_days', 0)} day(s)",
            f"Major revisions: {evidence_summary.get('major_revision_count', 0)}",
            f"Evidence strength: {evidence_summary.get('evidence_strength', 'low')}",
        ]

        for line in summary_lines:
            c.drawString(72, y, line)
            y -= 12

    if checkpoints:
        y -= 8
        if y < 150:
            y = _new_page(c, page_height)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(72, y, "Checkpoint timeline")
        y -= 18

        for checkpoint in checkpoints[-5:]:
            if y < 120:
                y = _new_page(c, page_height)

            c.setFont("Helvetica-Bold", 10)
            c.drawString(72, y, f"{checkpoint['created_at']} • {checkpoint['source_tool']}")
            y -= 12

            c.setFont("Helvetica", 10)
            chips = f"+{checkpoint.get('added_chars', 0)} chars, -{checkpoint.get('removed_chars', 0)} chars, change {checkpoint.get('change_pct', 0)}%"
            c.drawString(72, y, chips)
            y -= 12

            note = checkpoint.get("note") or "No session note provided."
            for line in _wrap(note, 95):
                if y < 96:
                    y = _new_page(c, page_height)
                c.drawString(72, y, line)
                y -= 12

            moment_prompt = checkpoint.get("moment_prompt")
            moment_answer = checkpoint.get("moment_answer")
            if moment_prompt and moment_answer:
                c.setFont("Helvetica-Bold", 10)
                c.drawString(72, y, "Moment question")
                y -= 12
                c.setFont("Helvetica", 10)
                for line in _wrap(moment_prompt, 95):
                    if y < 96:
                        y = _new_page(c, page_height)
                    c.drawString(72, y, line)
                    y -= 12
                for line in _wrap(moment_answer, 95):
                    if y < 96:
                        y = _new_page(c, page_height)
                    c.drawString(72, y, line)
                    y -= 12

            y -= 8

    if final_reflections:
        y -= 8
        if y < 160:
            y = _new_page(c, page_height)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(72, y, "Final export notes")
        y -= 18

        for key, value in final_reflections.items():
            text = str(value or "").strip()
            if not text:
                continue

            if y < 120:
                y = _new_page(c, page_height)

            c.setFont("Helvetica-Bold", 10)
            c.drawString(72, y, _pretty_label(key))
            y -= 12

            c.setFont("Helvetica", 10)
            for line in _wrap(text, 95):
                if y < 96:
                    y = _new_page(c, page_height)
                c.drawString(72, y, line)
                y -= 12

            y -= 6

    if y < 110:
        y = _new_page(c, page_height)

    c.setFont("Helvetica-Bold", 11)
    c.drawString(72, y, "Integrity stamp")
    y -= 14
    c.setFont("Helvetica", 9)

    for line in _wrap(integrity_hash, 95):
        if y < 96:
            y = _new_page(c, page_height)
        c.drawString(72, y, line)
        y -= 10

    c.save()
    return buf.getvalue()
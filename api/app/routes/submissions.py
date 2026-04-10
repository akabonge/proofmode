import hashlib
import html
import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..crypto import decrypt_json, decrypt_text, encrypt_json, encrypt_text
from ..db import get_db
from ..deps import get_current_user, require_csrf
from ..guidance import build_guidance, classify_assignment_mode
from ..models import Submission, SubmissionCheckpoint, User
from ..pdfgen import build_proof_pdf
from ..process import compute_diff_metrics, normalize_text, summarize_checkpoints
from ..schemas import (
    AnswersUpdate,
    CheckpointCreate,
    CheckpointOut,
    EvidenceSummaryOut,
    GuidanceOut,
    GuidanceRequest,
    ShareUpdate,
    SubmissionCreate,
    SubmissionOut,
    SubmissionUpdate,
)
from ..security import new_share_token

router = APIRouter(prefix="/v1", tags=["submissions"])


_BLOCK_TAG_RE = re.compile(r"</?(p|div|br|li|ul|ol|blockquote|h[1-6])[^>]*>", re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")


def _html_to_plain_text(value: str | None) -> str:
    text = value or ""
    if "<" not in text and ">" not in text:
        return text.strip()

    text = _BLOCK_TAG_RE.sub("\n", text)
    text = _TAG_RE.sub("", text)
    text = html.unescape(text)
    text = text.replace("\xa0", " ")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _checkpoints_for_submission(db: Session, submission_id: str) -> list[SubmissionCheckpoint]:
    return (
        db.query(SubmissionCheckpoint)
        .filter(SubmissionCheckpoint.submission_id == submission_id)
        .order_by(SubmissionCheckpoint.created_at.asc())
        .all()
    )


def _summary_for_submission(db: Session, submission_id: str) -> dict:
    rows = _checkpoints_for_submission(db, submission_id)
    return summarize_checkpoints(
        [
            {
                "created_at": row.created_at,
                "source_tool": row.source_tool,
                "added_chars": row.added_chars,
                "removed_chars": row.removed_chars,
                "change_ratio": row.change_ratio,
            }
            for row in rows
        ]
    )


def _assignment_prompt(sub: Submission) -> str | None:
    return decrypt_text(sub.assignment_prompt_enc) if sub.assignment_prompt_enc else None


def _essay_text(sub: Submission) -> str | None:
    return decrypt_text(sub.essay_text_enc) if sub.essay_text_enc else None


def _essay_plain_text(sub: Submission) -> str:
    return _html_to_plain_text(_essay_text(sub))


def _answers(sub: Submission) -> dict:
    return decrypt_json(sub.answers_enc)


def _to_checkpoint_out(row: SubmissionCheckpoint) -> CheckpointOut:
    return CheckpointOut(
        id=row.id,
        submission_id=row.submission_id,
        source_tool=row.source_tool,
        note=decrypt_text(row.note_enc) if row.note_enc else None,
        moment_prompt=decrypt_text(row.moment_prompt_enc) if row.moment_prompt_enc else None,
        moment_answer=decrypt_text(row.moment_answer_enc) if row.moment_answer_enc else None,
        added_chars=row.added_chars,
        removed_chars=row.removed_chars,
        change_ratio=row.change_ratio,
        diff_excerpt=decrypt_text(row.diff_excerpt_enc) if row.diff_excerpt_enc else None,
        created_at=row.created_at,
    )


def _canonical_integrity_payload(db: Session, sub: Submission, essay_text: str | None, answers: dict) -> str:
    checkpoints = _checkpoints_for_submission(db, sub.id)
    payload = {
        "id": sub.id,
        "owner_id": sub.owner_id,
        "assignment_type": sub.assignment_type,
        "assignment_mode": sub.assignment_mode,
        "title": sub.title,
        "course": sub.course,
        "assignment_prompt": _assignment_prompt(sub),
        "due_at": sub.due_at.isoformat() if sub.due_at else None,
        "student_name": sub.student_name,
        "include_name_on_pdf": sub.include_name_on_pdf,
        "essay_text": essay_text or "",
        "answers": answers,
        "checkpoints": [
            {
                "id": row.id,
                "created_at": row.created_at.isoformat(),
                "source_tool": row.source_tool,
                "added_chars": row.added_chars,
                "removed_chars": row.removed_chars,
                "change_ratio": row.change_ratio,
                "moment_prompt": decrypt_text(row.moment_prompt_enc) if row.moment_prompt_enc else None,
                "moment_answer": decrypt_text(row.moment_answer_enc) if row.moment_answer_enc else None,
            }
            for row in checkpoints
        ],
        "created_at": sub.created_at.isoformat(),
    }
    return json.dumps(payload, sort_keys=True)


def _refresh_integrity_hash(db: Session, sub: Submission):
    essay_text = _essay_text(sub)
    answers = _answers(sub)
    checkpoints = _checkpoints_for_submission(db, sub.id)

    meaningful_content = bool(_html_to_plain_text(essay_text) or answers or checkpoints)
    if meaningful_content:
        canonical = _canonical_integrity_payload(db, sub, essay_text, answers)
        sub.integrity_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    else:
        sub.integrity_hash = None


def _to_out(db: Session, sub: Submission, *, include_identity_fields: bool = True) -> SubmissionOut:
    summary = _summary_for_submission(db, sub.id)

    return SubmissionOut(
        id=sub.id,
        owner_id=sub.owner_id,
        assignment_type=sub.assignment_type,
        assignment_mode=sub.assignment_mode,
        title=sub.title,
        course=sub.course,
        assignment_prompt=_assignment_prompt(sub),
        due_at=sub.due_at,
        student_name=sub.student_name if include_identity_fields else None,
        include_name_on_pdf=sub.include_name_on_pdf if include_identity_fields else False,
        visibility=sub.visibility,
        share_enabled=sub.share_enabled,
        share_token=sub.share_token,
        essay_text=_essay_text(sub),
        answers=_answers(sub),
        integrity_hash=sub.integrity_hash,
        checkpoint_count=summary["checkpoint_count"],
        active_days=summary["active_days"],
        evidence_strength=summary["evidence_strength"],
        last_checkpoint_at=summary["last_checkpoint_at"],
        created_at=sub.created_at,
        updated_at=sub.updated_at,
    )


def _owned_submission_or_404(db: Session, sub_id: str, user_id: str) -> Submission:
    sub = db.get(Submission, sub_id)
    if not sub or sub.owner_id != user_id:
        raise HTTPException(status_code=404, detail="Submission not found")
    return sub


def _pdf_student_name(sub: Submission) -> str | None:
    return sub.student_name.strip() if sub.include_name_on_pdf and sub.student_name else None


def _reclassify_submission(sub: Submission):
    sub.assignment_mode = classify_assignment_mode(_assignment_prompt(sub), sub.title, sub.assignment_type)


@router.get("/prompts/{assignment_type}")
def get_prompts(assignment_type: str):
    return {"assignment_type": assignment_type, "prompts": []}


@router.post("/submissions", response_model=SubmissionOut, dependencies=[Depends(require_csrf)])
def create_submission(
    payload: SubmissionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = Submission(
        owner_id=user.id,
        assignment_type=payload.assignment_type,
        assignment_mode=classify_assignment_mode(payload.assignment_prompt, payload.title, payload.assignment_type),
        title=payload.title,
        course=payload.course,
        assignment_prompt_enc=encrypt_text(payload.assignment_prompt) if payload.assignment_prompt else None,
        due_at=payload.due_at,
        student_name=payload.student_name.strip() if payload.student_name else None,
        include_name_on_pdf=payload.include_name_on_pdf,
        visibility="private",
        share_enabled=False,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return _to_out(db, sub)


@router.get("/submissions", response_model=list[SubmissionOut])
def list_submissions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (
        db.query(Submission)
        .filter(Submission.owner_id == user.id)
        .order_by(Submission.updated_at.desc())
        .all()
    )
    return [_to_out(db, row) for row in rows]


@router.get("/submissions/{sub_id}", response_model=SubmissionOut)
def get_submission(sub_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    sub = _owned_submission_or_404(db, sub_id, user.id)
    return _to_out(db, sub)


@router.put("/submissions/{sub_id}", response_model=SubmissionOut, dependencies=[Depends(require_csrf)])
def update_submission(
    sub_id: str,
    payload: SubmissionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = _owned_submission_or_404(db, sub_id, user.id)

    if payload.title is not None:
        sub.title = payload.title
    if payload.course is not None:
        sub.course = payload.course
    if payload.assignment_prompt is not None:
        sub.assignment_prompt_enc = encrypt_text(payload.assignment_prompt) if payload.assignment_prompt else None
    if payload.due_at is not None:
        sub.due_at = payload.due_at
    if payload.student_name is not None:
        sub.student_name = payload.student_name.strip() or None
    if payload.include_name_on_pdf is not None:
        sub.include_name_on_pdf = payload.include_name_on_pdf
    if payload.essay_text is not None:
        sub.essay_text_enc = encrypt_text(payload.essay_text)

    _reclassify_submission(sub)
    _refresh_integrity_hash(db, sub)
    db.commit()
    db.refresh(sub)
    return _to_out(db, sub)


@router.put("/submissions/{sub_id}/answers", response_model=SubmissionOut, dependencies=[Depends(require_csrf)])
def update_answers(
    sub_id: str,
    payload: AnswersUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = _owned_submission_or_404(db, sub_id, user.id)
    sub.answers_enc = encrypt_json(payload.answers)
    _refresh_integrity_hash(db, sub)
    db.commit()
    db.refresh(sub)
    return _to_out(db, sub)


@router.post("/submissions/{sub_id}/guidance", response_model=GuidanceOut)
def submission_guidance(
    sub_id: str,
    payload: GuidanceRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = _owned_submission_or_404(db, sub_id, user.id)
    rows = _checkpoints_for_submission(db, sub.id)

    saved_draft = _essay_plain_text(sub)
    current_draft = (
        _html_to_plain_text(payload.current_draft)
        if payload.current_draft is not None
        else saved_draft
    )

    previous_text = ""
    comparison_source = "blank"
    if rows:
        previous_text = _html_to_plain_text(decrypt_text(rows[-1].draft_text_enc))
        comparison_source = "last_checkpoint"
    elif payload.current_draft is not None and normalize_text(current_draft) != normalize_text(saved_draft):
        previous_text = saved_draft
        comparison_source = "saved_draft"

    guidance = build_guidance(
        assignment_prompt=payload.assignment_prompt if payload.assignment_prompt is not None else _assignment_prompt(sub),
        title=payload.title if payload.title is not None else sub.title,
        assignment_type=payload.assignment_type if payload.assignment_type is not None else sub.assignment_type,
        due_at=payload.due_at if payload.due_at is not None else sub.due_at,
        checkpoint_count=len(rows),
        previous_text=previous_text,
        current_text=current_draft,
    )
    metrics = compute_diff_metrics(previous_text, current_draft)
    return GuidanceOut(
        **guidance,
        comparison_source=comparison_source,
        added_chars=metrics["added_chars"],
        removed_chars=metrics["removed_chars"],
        change_ratio=metrics["change_ratio"],
    )


@router.post("/submissions/{sub_id}/checkpoints", response_model=CheckpointOut, dependencies=[Depends(require_csrf)])
def create_checkpoint(
    sub_id: str,
    payload: CheckpointCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = _owned_submission_or_404(db, sub_id, user.id)

    current_markup = (payload.draft_text or "").strip()
    current_text = _html_to_plain_text(current_markup)
    if not current_text:
        raise HTTPException(status_code=400, detail="Checkpoint requires current draft text")

    previous_rows = _checkpoints_for_submission(db, sub.id)
    previous_text = ""
    if previous_rows:
        previous_text = _html_to_plain_text(decrypt_text(previous_rows[-1].draft_text_enc))

    guidance = build_guidance(
        assignment_prompt=_assignment_prompt(sub),
        title=sub.title,
        assignment_type=sub.assignment_type,
        due_at=sub.due_at,
        checkpoint_count=len(previous_rows),
        previous_text=previous_text,
        current_text=current_text,
    )

    metrics = compute_diff_metrics(previous_text, current_text)

    row = SubmissionCheckpoint(
        submission_id=sub.id,
        source_tool=payload.source_tool,
        draft_text_enc=encrypt_text(current_markup),
        note_enc=encrypt_text(payload.note) if payload.note else None,
        moment_prompt_enc=encrypt_text(guidance["dynamic_prompt"]) if guidance["dynamic_prompt"] else None,
        moment_answer_enc=encrypt_text(payload.moment_answer) if payload.moment_answer else None,
        diff_excerpt_enc=encrypt_text(metrics["diff_excerpt"]) if metrics["diff_excerpt"] else None,
        added_chars=metrics["added_chars"],
        removed_chars=metrics["removed_chars"],
        change_ratio=metrics["change_ratio"],
        created_at=datetime.now(timezone.utc),
    )

    sub.assignment_mode = guidance["assignment_mode"]
    sub.essay_text_enc = encrypt_text(current_markup)
    sub.last_checkpoint_at = row.created_at

    db.add(row)
    db.flush()
    _refresh_integrity_hash(db, sub)
    db.commit()
    db.refresh(row)

    return _to_checkpoint_out(row)


@router.get("/submissions/{sub_id}/checkpoints", response_model=list[CheckpointOut])
def list_checkpoints(sub_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    sub = _owned_submission_or_404(db, sub_id, user.id)
    rows = _checkpoints_for_submission(db, sub.id)
    return [_to_checkpoint_out(row) for row in rows]


@router.get("/submissions/{sub_id}/evidence-summary", response_model=EvidenceSummaryOut)
def evidence_summary(sub_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    sub = _owned_submission_or_404(db, sub_id, user.id)
    return EvidenceSummaryOut(**_summary_for_submission(db, sub.id))


@router.post("/submissions/{sub_id}/share", response_model=SubmissionOut, dependencies=[Depends(require_csrf)])
def set_share(
    sub_id: str,
    payload: ShareUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = _owned_submission_or_404(db, sub_id, user.id)

    if payload.visibility == "private":
        sub.visibility = "private"
        sub.share_enabled = False
        sub.share_token = None
    else:
        sub.visibility = payload.visibility
        sub.share_enabled = True
        sub.share_token = sub.share_token or new_share_token()

    db.commit()
    db.refresh(sub)
    return _to_out(db, sub)


@router.get("/submissions/{sub_id}/pdf")
def download_private_pdf(sub_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    sub = _owned_submission_or_404(db, sub_id, user.id)

    if not sub.integrity_hash:
        raise HTTPException(status_code=400, detail="Capture at least one checkpoint or save content before downloading PDF")

    summary = _summary_for_submission(db, sub.id)
    final_reflections = _answers(sub)

    checkpoints = [
        {
            "created_at": row.created_at.strftime("%Y-%m-%d %H:%M"),
            "source_tool": row.source_tool,
            "note": decrypt_text(row.note_enc) if row.note_enc else None,
            "moment_prompt": decrypt_text(row.moment_prompt_enc) if row.moment_prompt_enc else None,
            "moment_answer": decrypt_text(row.moment_answer_enc) if row.moment_answer_enc else None,
            "added_chars": row.added_chars,
            "removed_chars": row.removed_chars,
            "change_pct": round(row.change_ratio * 100),
        }
        for row in _checkpoints_for_submission(db, sub.id)
    ]

    pdf = build_proof_pdf(
        title=sub.title,
        course=sub.course,
        assignment_label=sub.assignment_mode,
        created_at=sub.created_at,
        integrity_hash=sub.integrity_hash,
        student_name=_pdf_student_name(sub),
        assignment_prompt=_assignment_prompt(sub),
        evidence_summary=summary,
        checkpoints=checkpoints,
        final_reflections=final_reflections,
    )

    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="proofmode-proof.pdf"'},
    )


@router.get("/share/{token}", response_model=SubmissionOut)
def get_shared_submission(token: str, db: Session = Depends(get_db)):
    sub = (
        db.query(Submission)
        .filter(Submission.share_token == token, Submission.share_enabled == True)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Shared proof not found")

    out = _to_out(db, sub, include_identity_fields=False)
    if sub.visibility == "share_pdf":
        out.essay_text = None
        out.answers = {}
    return out


@router.get("/share/{token}/pdf")
def download_shared_pdf(token: str, db: Session = Depends(get_db)):
    sub = (
        db.query(Submission)
        .filter(Submission.share_token == token, Submission.share_enabled == True)
        .first()
    )
    if not sub or sub.visibility not in {"share_pdf", "share_full"}:
        raise HTTPException(status_code=404, detail="Shared proof not found")

    if not sub.integrity_hash:
        raise HTTPException(status_code=400, detail="Proof not ready")

    summary = _summary_for_submission(db, sub.id)
    answers = _answers(sub)

    checkpoints = [
        {
            "created_at": row.created_at.strftime("%Y-%m-%d %H:%M"),
            "source_tool": row.source_tool,
            "note": decrypt_text(row.note_enc) if row.note_enc else None,
            "moment_prompt": decrypt_text(row.moment_prompt_enc) if row.moment_prompt_enc else None,
            "moment_answer": decrypt_text(row.moment_answer_enc) if row.moment_answer_enc else None,
            "added_chars": row.added_chars,
            "removed_chars": row.removed_chars,
            "change_pct": round(row.change_ratio * 100),
        }
        for row in _checkpoints_for_submission(db, sub.id)
    ]

    pdf = build_proof_pdf(
        title=sub.title,
        course=sub.course,
        assignment_label=sub.assignment_mode,
        created_at=sub.created_at,
        integrity_hash=sub.integrity_hash,
        student_name=_pdf_student_name(sub),
        assignment_prompt=_assignment_prompt(sub),
        evidence_summary=summary,
        checkpoints=checkpoints if sub.visibility == "share_full" else [],
        final_reflections=answers if sub.visibility == "share_full" else {},
    )

    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="proofmode-proof.pdf"'},
    )

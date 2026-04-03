import re
from datetime import datetime, timezone

from .process import compute_diff_metrics, normalize_text


def classify_assignment_mode(assignment_prompt: str | None, title: str | None = None, assignment_type: str | None = None) -> str:
    haystack = " ".join(
        [
            (assignment_prompt or ""),
            (title or ""),
            (assignment_type or ""),
        ]
    ).lower()

    checks = [
        ("reflection", ["reflection", "reflect", "journal", "personal response", "self-assessment"]),
        ("memo", ["memo", "recommendation", "executive summary", "briefing"]),
        ("case_analysis", ["case study", "case analysis", "case brief"]),
        ("research_paper", ["research", "literature review", "sources", "citation", "works cited", "bibliography"]),
        ("lab_report", ["lab", "methods", "results", "discussion", "experiment"]),
        ("proposal", ["proposal", "pitch", "plan", "feasibility"]),
        ("discussion_post", ["discussion post", "forum", "response post"]),
        ("argumentative_essay", ["argue", "position", "claim", "thesis", "persuade", "essay"]),
    ]

    for label, keywords in checks:
        if any(keyword in haystack for keyword in keywords):
            return label

    return "general_writing"


def compute_stage(checkpoint_count: int, due_at: datetime | None) -> str:
    if checkpoint_count == 0:
        return "starting"

    if due_at is not None:
        now = datetime.now(timezone.utc)
        due = due_at if due_at.tzinfo else due_at.replace(tzinfo=timezone.utc)
        days_left = (due.date() - now.date()).days
        if days_left <= 1:
            return "finalizing"

    if checkpoint_count <= 1:
        return "building"
    if checkpoint_count <= 3:
        return "developing"
    return "revising"


def detect_change_type(previous_text: str | None, current_text: str | None) -> str:
    prev = previous_text or ""
    curr = current_text or ""
    metrics = compute_diff_metrics(prev, curr)

    if not normalize_text(prev):
        return "first_capture"

    prev_lower = prev.lower()
    curr_lower = curr.lower()

    citation_regex = r"\([A-Za-z].+?,\s?\d{4}\)|\[[0-9]+\]|doi|et al\.|works cited|references"
    new_citations = re.search(citation_regex, curr_lower) and not re.search(citation_regex, prev_lower)

    if new_citations:
        return "evidence_added"

    if metrics["change_ratio"] >= 0.35:
        return "major_revision"

    if len(curr) - len(prev) > 600:
        return "expansion"

    if normalize_text(prev[:300]) != normalize_text(curr[:300]) and metrics["change_ratio"] >= 0.12:
        return "reframing"

    if metrics["change_ratio"] <= 0.08:
        return "polishing"

    return "development"


def generate_dynamic_prompt(assignment_mode: str, stage: str, change_type: str) -> str:
    if change_type == "first_capture":
        prompts = {
            "reflection": "What experience, reading, or idea are you trying to make sense of in this first version?",
            "memo": "What decision, recommendation, or audience need is driving this first version?",
            "case_analysis": "What problem or decision is at the center of this case right now?",
            "research_paper": "What question or line of inquiry is this draft starting to answer?",
            "lab_report": "What result, pattern, or interpretation are you trying to explain in this version?",
            "proposal": "What are you proposing, and why does it matter right now?",
            "discussion_post": "What is the core response or takeaway you are trying to articulate in this post?",
            "argumentative_essay": "What main claim or position are you trying to establish in this first version?",
            "general_writing": "What is the main task this assignment is asking you to accomplish in this version?",
        }
        return prompts.get(assignment_mode, prompts["general_writing"])

    if change_type == "evidence_added":
        return "What new source, example, reading, or evidence most changed this version?"

    if change_type == "major_revision":
        return "What changed most in your reasoning, structure, or focus since the last checkpoint?"

    if change_type == "reframing":
        return "What made you rethink the opening, framing, or direction of the piece in this version?"

    if change_type == "expansion":
        return "What did you add here that makes the draft more complete or more convincing?"

    if change_type == "polishing":
        return "What did you clarify or improve here without changing the core idea?"

    stage_prompts = {
        "starting": "What part feels most uncertain or unfinished right now?",
        "building": "What part of the argument or response became clearer during this session?",
        "developing": "What is becoming stronger in the draft, and what still feels incomplete?",
        "revising": "What revision decision mattered most in this session?",
        "finalizing": "What final revision are you making to prepare this for submission?",
    }

    return stage_prompts.get(stage, "What changed in this session?")


def suggested_checkpoint_note(change_type: str, assignment_mode: str) -> str:
    mapping = {
        "first_capture": "Started a first real version of the assignment and established the direction.",
        "evidence_added": "Added evidence, examples, or sources that changed the draft.",
        "major_revision": "Made a major revision to the structure or reasoning.",
        "reframing": "Reworked the opening or reframed the main direction of the piece.",
        "expansion": "Expanded the draft with new content and fuller development.",
        "polishing": "Refined wording, structure, or clarity without changing the core idea.",
        "development": "Continued developing the assignment and clarified key points.",
    }
    return mapping.get(change_type, "Worked on the assignment and moved the draft forward.")


def build_guidance(
    assignment_prompt: str | None,
    title: str | None,
    assignment_type: str | None,
    due_at: datetime | None,
    checkpoint_count: int,
    previous_text: str | None,
    current_text: str | None,
) -> dict:
    assignment_mode = classify_assignment_mode(assignment_prompt, title, assignment_type)
    stage = compute_stage(checkpoint_count, due_at)
    change_type = detect_change_type(previous_text, current_text)
    prompt = generate_dynamic_prompt(assignment_mode, stage, change_type)
    note_hint = suggested_checkpoint_note(change_type, assignment_mode)

    return {
        "assignment_mode": assignment_mode,
        "stage": stage,
        "detected_change": change_type,
        "dynamic_prompt": prompt,
        "suggested_checkpoint_note": note_hint,
    }
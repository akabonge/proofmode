import difflib
from typing import Iterable


def normalize_text(text: str | None) -> str:
    return " ".join((text or "").replace("\r", "\n").split())


def compute_diff_metrics(previous_text: str | None, current_text: str | None) -> dict:
    prev = normalize_text(previous_text)
    curr = normalize_text(current_text)

    prev_words = prev.split()
    curr_words = curr.split()

    matcher = difflib.SequenceMatcher(a=prev_words, b=curr_words)

    added_chars = 0
    removed_chars = 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag in ("insert", "replace"):
            added_chars += len(" ".join(curr_words[j1:j2]))
        if tag in ("delete", "replace"):
            removed_chars += len(" ".join(prev_words[i1:i2]))

    total_size = max(len(prev) + len(curr), 1)
    change_ratio = round((added_chars + removed_chars) / total_size, 3)

    diff_excerpt = "\n".join(
        list(
            difflib.unified_diff(
                (previous_text or "").splitlines(),
                (current_text or "").splitlines(),
                lineterm="",
            )
        )[:20]
    )

    return {
        "added_chars": added_chars,
        "removed_chars": removed_chars,
        "change_ratio": change_ratio,
        "diff_excerpt": diff_excerpt or None,
    }


def summarize_checkpoints(checkpoints: Iterable[dict]) -> dict:
    rows = list(checkpoints)
    if not rows:
        return {
            "checkpoint_count": 0,
            "active_days": 0,
            "timespan_days": 0,
            "total_added_chars": 0,
            "total_removed_chars": 0,
            "major_revision_count": 0,
            "evidence_strength": "low",
            "latest_source_tool": None,
            "last_checkpoint_at": None,
        }

    timestamps = [row["created_at"] for row in rows]
    days = {ts.date() for ts in timestamps}

    total_added = sum(int(row.get("added_chars", 0) or 0) for row in rows)
    total_removed = sum(int(row.get("removed_chars", 0) or 0) for row in rows)
    major_revision_count = sum(1 for row in rows if float(row.get("change_ratio", 0) or 0) >= 0.15)

    earliest = min(timestamps)
    latest = max(timestamps)
    timespan_days = max((latest.date() - earliest.date()).days + 1, 1)

    checkpoint_count = len(rows)
    active_days = len(days)

    if checkpoint_count >= 5 and active_days >= 3 and major_revision_count >= 2:
        evidence_strength = "high"
    elif checkpoint_count >= 3 and active_days >= 2:
        evidence_strength = "medium"
    else:
        evidence_strength = "low"

    return {
        "checkpoint_count": checkpoint_count,
        "active_days": active_days,
        "timespan_days": timespan_days,
        "total_added_chars": total_added,
        "total_removed_chars": total_removed,
        "major_revision_count": major_revision_count,
        "evidence_strength": evidence_strength,
        "latest_source_tool": rows[-1].get("source_tool"),
        "last_checkpoint_at": latest,
    }
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api";
import {
  humanizeAssignmentMode,
  humanizeEvidenceStrength,
  humanizeSourceTool,
} from "../../../lib/display";

type SharedCheckpoint = {
  id: string;
  created_at: string;
  source_tool?: string | null;
  note?: string | null;
  moment_prompt?: string | null;
  moment_answer?: string | null;
  added_chars?: number;
  removed_chars?: number;
  change_ratio?: number;
  diff_excerpt?: string | null;
};

type SharedEvidenceSummary = {
  checkpoint_count?: number;
  active_days?: number;
  timespan_days?: number;
  total_added_chars?: number;
  total_removed_chars?: number;
  major_revision_count?: number;
  evidence_strength?: "low" | "medium" | "high" | string;
  latest_source_tool?: string | null;
  last_checkpoint_at?: string | null;
};

type SharedProof = {
  title?: string;
  course?: string | null;
  assignment_mode?: string | null;
  assignment_prompt?: string | null;
  essay_text?: string | null;
  student_name?: string | null;
  include_name_on_pdf?: boolean;
  visibility?: string | null;
  share_enabled?: boolean;
  share_token?: string | null;
  answers?: {
    biggest_change?: string;
    most_helpful_input?: string;
    instructor_context?: string;
  } | null;
  summary?: SharedEvidenceSummary | null;
  checkpoints?: SharedCheckpoint[];
};

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function formatDayLabel(dateString: string) {
  const d = new Date(dateString);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function groupCheckpointsByDay(checkpoints: SharedCheckpoint[]) {
  const groups = new Map<string, SharedCheckpoint[]>();

  for (const checkpoint of checkpoints) {
    const key = new Date(checkpoint.created_at).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(checkpoint);
  }

  return Array.from(groups.entries())
    .map(([key, items]) => ({
      key,
      label: formatDayLabel(items[0].created_at),
      items: items.slice().sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    }))
    .sort((a, b) => {
      return new Date(b.items[0].created_at).getTime() - new Date(a.items[0].created_at).getTime();
    });
}

function renderPreviewHtml(value: string) {
  if (!value.trim()) {
    return "<p></p>";
  }
  if (/<[a-z][\s\S]*>/i.test(value)) {
    return value;
  }
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export default function SharedProofPage({ params }: { params: { token: string } }) {
  const [proof, setProof] = useState<SharedProof | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const groupedCheckpoints = useMemo(
    () => groupCheckpointsByDay(proof?.checkpoints || []),
    [proof?.checkpoints]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch<SharedProof>(`/v1/share/${params.token}`);

        if (!cancelled) {
          setProof(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Could not load shared proof."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.token]);

  if (loading) {
    return (
      <main className="shell">
        <div className="card stack">
          <h3>Loading shared proof...</h3>
        </div>
      </main>
    );
  }

  if (error || !proof) {
    return (
      <main className="shell">
        <div className="card stack">
          <h3>Shared proof unavailable</h3>
          <p className="muted">{error || "This shared proof could not be loaded."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="topnav">
        <div>
          <h2 className="page-title">{proof.title || "Shared proof"}</h2>
          <div className="subtitle">
            {humanizeAssignmentMode(proof.assignment_mode)}
            {proof.course ? ` - ${proof.course}` : ""}
          </div>
        </div>
      </div>

      <div className="row">
        <div className="stack">
          <div className="card stack">
            <h3>Assignment context</h3>

            {proof.include_name_on_pdf && proof.student_name ? (
              <div>
                <label>Student</label>
                <input value={proof.student_name} readOnly />
              </div>
            ) : null}

            {proof.assignment_prompt ? (
              <div>
                <label>Assignment prompt or rubric</label>
                <textarea rows={6} value={proof.assignment_prompt} readOnly />
              </div>
            ) : (
              <p className="muted">No assignment prompt was shared.</p>
            )}
          </div>

          {proof.essay_text ? (
            <div className="card stack">
              <h3>Current draft snapshot</h3>
              <div
                className="rendered-rich-text"
                dangerouslySetInnerHTML={{ __html: renderPreviewHtml(proof.essay_text) }}
              />
            </div>
          ) : null}

          {proof.answers ? (
            <div className="card stack">
              <h3>Final export notes</h3>

              {proof.answers.biggest_change ? (
                <div>
                  <label>What changed most across the whole process?</label>
                  <textarea rows={3} value={proof.answers.biggest_change} readOnly />
                </div>
              ) : null}

              {proof.answers.most_helpful_input ? (
                <div>
                  <label>What input influenced the final version most?</label>
                  <textarea rows={3} value={proof.answers.most_helpful_input} readOnly />
                </div>
              ) : null}

              {proof.answers.instructor_context ? (
                <div>
                  <label>Instructor context</label>
                  <textarea rows={3} value={proof.answers.instructor_context} readOnly />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="stack">
          {proof.summary ? (
            <div className="card stack">
              <h3>Evidence summary</h3>

              <div className="metric-grid">
                <div className="metric-card">
                  <div className="metric-label">Checkpoints</div>
                  <div className="metric-value">{proof.summary.checkpoint_count ?? 0}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Active days</div>
                  <div className="metric-value">{proof.summary.active_days ?? 0}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Timespan</div>
                  <div className="metric-value">{proof.summary.timespan_days ?? 0}d</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Major revisions</div>
                  <div className="metric-value">{proof.summary.major_revision_count ?? 0}</div>
                </div>
              </div>

              <div className="status-row">
                <span className="muted">Evidence strength:</span>
                <span className="status-pill">
                  {humanizeEvidenceStrength(proof.summary.evidence_strength)}
                </span>
              </div>

              {proof.summary.last_checkpoint_at ? (
                <p className="muted small">
                  Last checkpoint: {new Date(proof.summary.last_checkpoint_at).toLocaleString()}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="card stack">
            <h3>Checkpoint timeline</h3>

            {groupedCheckpoints.length === 0 ? (
              <p className="muted">No checkpoints were shared.</p>
            ) : (
              <div className="timeline">
                {groupedCheckpoints.map((group) => (
                  <div key={group.key} className="timeline-day-group">
                    <div className="timeline-day-heading">{group.label}</div>

                    <div className="timeline">
                      {group.items.map((checkpoint) => (
                        <div key={checkpoint.id} className="timeline-item">
                          <div className="timeline-meta">
                            <strong>
                              {new Date(checkpoint.created_at).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </strong>
                            {checkpoint.source_tool ? (
                              <span className="status-pill">
                                {humanizeSourceTool(checkpoint.source_tool)}
                              </span>
                            ) : null}
                          </div>

                          <div className="chip-row">
                            <span className="chip">+{checkpoint.added_chars ?? 0} chars</span>
                            <span className="chip">-{checkpoint.removed_chars ?? 0} chars</span>
                            <span className="chip">
                              change {Math.round((checkpoint.change_ratio ?? 0) * 100)}%
                            </span>
                          </div>

                          {checkpoint.note ? <p>{checkpoint.note}</p> : null}

                          {checkpoint.moment_prompt ? (
                            <p className="muted small">
                              <strong>Moment question:</strong> {checkpoint.moment_prompt}
                            </p>
                          ) : null}

                          {checkpoint.moment_answer ? (
                            <p className="muted small">
                              <strong>Moment answer:</strong> {checkpoint.moment_answer}
                            </p>
                          ) : null}

                          {checkpoint.diff_excerpt ? (
                            <p className="muted small">
                              <strong>Diff excerpt:</strong> {checkpoint.diff_excerpt}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

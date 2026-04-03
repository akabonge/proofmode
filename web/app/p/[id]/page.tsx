"use client";

import { useEffect, useMemo, useState } from "react";
import { API, apiFetch, seedCsrf } from "../../../lib/api";

type Checkpoint = {
  id: string;
  source_tool: string;
  note?: string | null;
  moment_prompt?: string | null;
  moment_answer?: string | null;
  added_chars: number;
  removed_chars: number;
  change_ratio: number;
  diff_excerpt?: string | null;
  created_at: string;
};

type EvidenceSummary = {
  checkpoint_count: number;
  active_days: number;
  timespan_days: number;
  total_added_chars: number;
  total_removed_chars: number;
  major_revision_count: number;
  evidence_strength: "low" | "medium" | "high";
  latest_source_tool?: string | null;
  last_checkpoint_at?: string | null;
};

type Guidance = {
  assignment_mode: string;
  stage: string;
  detected_change: string;
  dynamic_prompt: string;
  suggested_checkpoint_note: string;
};

const DEFAULT_FINAL_ANSWERS = {
  biggest_change: "",
  most_helpful_input: "",
  instructor_context: "",
};

function formatDayLabel(dateString: string) {
  const d = new Date(dateString);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function groupCheckpointsByDay(checkpoints: Checkpoint[]) {
  const groups = new Map<string, Checkpoint[]>();

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

function daysBetweenNow(dateString?: string | null) {
  if (!dateString) return null;
  const now = new Date();
  const then = new Date(dateString);
  const ms = now.getTime() - then.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default function ProofPage({ params }: { params: { id: string } }) {
  const [submission, setSubmission] = useState<any>(null);
  const [summary, setSummary] = useState<EvidenceSummary | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [guidance, setGuidance] = useState<Guidance | null>(null);

  const [assignmentPrompt, setAssignmentPrompt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [essayText, setEssayText] = useState("");
  const [studentName, setStudentName] = useState("");
  const [includeNameOnPdf, setIncludeNameOnPdf] = useState(false);
  const [sourceTool, setSourceTool] = useState("google_docs");
  const [checkpointNote, setCheckpointNote] = useState("");
  const [momentAnswer, setMomentAnswer] = useState("");
  const [finalAnswers, setFinalAnswers] = useState(DEFAULT_FINAL_ANSWERS);

  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [refreshingGuidance, setRefreshingGuidance] = useState(false);
  const [message, setMessage] = useState("");

  const pdfDownloadHref = useMemo(() => {
    return submission ? `${API}/v1/submissions/${submission.id}/pdf` : "#";
  }, [submission]);

  const groupedCheckpoints = useMemo(() => groupCheckpointsByDay(checkpoints), [checkpoints]);

  const lastCheckpointText = useMemo(() => {
    if (!summary?.last_checkpoint_at) return "No checkpoint captured yet.";
    return new Date(summary.last_checkpoint_at).toLocaleString();
  }, [summary]);

  const nextStepText = useMemo(() => {
    const days = daysBetweenNow(summary?.last_checkpoint_at);
    if (summary?.checkpoint_count === 0) {
      return "After your first real writing session, paste the latest draft here and capture your first checkpoint.";
    }
    if (days === null) {
      return "Come back after your next real writing session and capture another checkpoint.";
    }
    if (days <= 0) {
      return "You already captured work today. Come back after your next writing session or when the draft materially changes.";
    }
    if (days === 1) {
      return "It has been 1 day since your last checkpoint. Capture the next version after today’s writing session.";
    }
    return `It has been ${days} days since your last checkpoint. Reopen this proof after your next real writing session and capture the new version.`;
  }, [summary]);

  async function loadAll() {
    try {
      const [subRes, summaryRes, checkpointsRes] = await Promise.all([
        apiFetch(`/v1/submissions/${params.id}`),
        apiFetch(`/v1/submissions/${params.id}/evidence-summary`),
        apiFetch(`/v1/submissions/${params.id}/checkpoints`),
      ]);

      if (subRes.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!subRes.ok) {
        const data = await subRes.json().catch(() => ({}));
        setMessage(data.detail || "Could not load proof.");
        return;
      }

      if (!summaryRes.ok) {
        const data = await summaryRes.json().catch(() => ({}));
        setMessage(data.detail || "Could not load evidence summary.");
        return;
      }

      if (!checkpointsRes.ok) {
        const data = await checkpointsRes.json().catch(() => ({}));
        setMessage(data.detail || "Could not load checkpoints.");
        return;
      }

      const sub = await subRes.json();
      const summaryData = await summaryRes.json();
      const checkpointData = await checkpointsRes.json();

      setSubmission(sub);
      setSummary(summaryData);
      setCheckpoints(checkpointData);

      setAssignmentPrompt(sub.assignment_prompt || "");
      setDueAt(sub.due_at ? new Date(sub.due_at).toISOString().slice(0, 16) : "");
      setEssayText(sub.essay_text || "");
      setStudentName(sub.student_name || "");
      setIncludeNameOnPdf(Boolean(sub.include_name_on_pdf));
      setFinalAnswers({
        biggest_change: sub.answers?.biggest_change || "",
        most_helpful_input: sub.answers?.most_helpful_input || "",
        instructor_context: sub.answers?.instructor_context || "",
      });

      await loadGuidance(sub.essay_text || "", true);
    } catch {
      setMessage("Could not load this proof page.");
    }
  }

  async function loadGuidance(currentDraft: string, quiet = false) {
    try {
      setRefreshingGuidance(true);

      const res = await apiFetch(`/v1/submissions/${params.id}/guidance`, {
        method: "POST",
        body: JSON.stringify({ current_draft: currentDraft }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGuidance(null);
        if (!quiet) setMessage(data.detail || "Could not load guidance.");
        return;
      }

      const data = await res.json();
      setGuidance(data);

      if (!checkpointNote.trim() && data?.suggested_checkpoint_note) {
        setCheckpointNote(data.suggested_checkpoint_note);
      }
    } catch {
      setGuidance(null);
      if (!quiet) setMessage("Could not refresh moment question.");
    } finally {
      setRefreshingGuidance(false);
    }
  }

  useEffect(() => {
    seedCsrf();
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function saveProof() {
    if (!submission) return;

    try {
      setSaving(true);
      setMessage("Saving...");

      const updateRes = await apiFetch(`/v1/submissions/${params.id}`, {
        method: "PUT",
        body: JSON.stringify({
          assignment_prompt: assignmentPrompt,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
          essay_text: essayText,
          student_name: studentName,
          include_name_on_pdf: includeNameOnPdf,
        }),
      });

      if (!updateRes.ok) {
        const data = await updateRes.json().catch(() => ({}));
        setMessage(data.detail || "Could not save proof.");
        return;
      }

      const answersRes = await apiFetch(`/v1/submissions/${params.id}/answers`, {
        method: "PUT",
        body: JSON.stringify({ answers: finalAnswers }),
      });

      if (!answersRes.ok) {
        const data = await answersRes.json().catch(() => ({}));
        setMessage(data.detail || "Could not save export notes.");
        return;
      }

      await loadAll();
      setMessage("Saved.");
    } catch {
      setMessage("Could not save proof.");
    } finally {
      setSaving(false);
    }
  }

  async function captureCheckpoint() {
    if (!essayText.trim()) {
      setMessage("Paste your current working draft before capturing a checkpoint.");
      return;
    }

    try {
      setCapturing(true);
      setMessage("Capturing checkpoint...");

      const updateRes = await apiFetch(`/v1/submissions/${params.id}`, {
        method: "PUT",
        body: JSON.stringify({
          assignment_prompt: assignmentPrompt,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
          essay_text: essayText,
          student_name: studentName,
          include_name_on_pdf: includeNameOnPdf,
        }),
      });

      if (!updateRes.ok) {
        const data = await updateRes.json().catch(() => ({}));
        setMessage(data.detail || "Could not save draft before checkpoint.");
        return;
      }

      const res = await apiFetch(`/v1/submissions/${params.id}/checkpoints`, {
        method: "POST",
        body: JSON.stringify({
          source_tool: sourceTool,
          draft_text: essayText,
          note: checkpointNote,
          moment_answer: momentAnswer,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.detail || "Could not capture checkpoint.");
        return;
      }

      setMomentAnswer("");
      setCheckpointNote("");
      await loadAll();
      setMessage("Checkpoint captured.");
    } catch {
      setMessage("Could not capture checkpoint.");
    } finally {
      setCapturing(false);
    }
  }

  async function setVisibility(visibility: string) {
    try {
      const res = await apiFetch(`/v1/submissions/${params.id}/share`, {
        method: "POST",
        body: JSON.stringify({ visibility }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.detail || "Could not update sharing.");
        return;
      }

      const updated = await res.json();
      setSubmission(updated);
      setMessage("Sharing updated.");
    } catch {
      setMessage("Could not update sharing.");
    }
  }

  if (!submission || !summary) {
    return (
      <main className="shell">
        <div className="card stack">
          <h3>Loading proof...</h3>
          {message && <div className="status-pill">{message}</div>}
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="topnav">
        <div>
          <h2 className="page-title">{submission.title}</h2>
          <div className="subtitle">
            {submission.assignment_mode} {submission.course ? `• ${submission.course}` : ""}
          </div>
        </div>

        <div className="toolbar">
          <a className="btn secondary" href="/dashboard">
            Back to dashboard
          </a>
          <a className="btn secondary" href={pdfDownloadHref} target="_blank" rel="noreferrer">
            Download PDF
          </a>
        </div>
      </div>

      <div className="card stack spaced-lg">
        <div className="badge">This proof grows over time</div>
        <p className="muted">
          Reopen this same page after later writing sessions. Each checkpoint becomes another dated entry in the timeline below.
        </p>
        <div className="metric-grid">
          <div className="metric-card">
            <div className="metric-label">Last checkpoint</div>
            <div className="small muted">{lastCheckpointText}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Next best step</div>
            <div className="small muted">{nextStepText}</div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="stack">
          <div className="card stack">
            <div className="badge">Write anywhere. Capture proof here.</div>
            <p className="muted">
              Keep using Google Docs or Word. After real writing sessions, come here to capture a lightweight checkpoint.
            </p>

            <div>
              <label>Assignment prompt or rubric</label>
              <textarea
                rows={5}
                value={assignmentPrompt}
                onChange={(e) => setAssignmentPrompt(e.target.value)}
                placeholder="Paste the assignment instructions here. ProofMode uses this to make guidance more specific to the work at hand."
              />
            </div>

            <div className="grid-two">
              <div>
                <label>Due date (optional)</label>
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>

              <div>
                <label>Student name (optional)</label>
                <input
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="Aloysious Kabonge"
                />
              </div>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={includeNameOnPdf}
                onChange={(e) => setIncludeNameOnPdf(e.target.checked)}
              />
              <span>Include student name on exported PDFs</span>
            </label>

            <div>
              <label>Current working draft</label>
              <textarea
                rows={12}
                value={essayText}
                onChange={(e) => setEssayText(e.target.value)}
                placeholder="Paste the latest version of your working draft here."
              />
            </div>

            <div className="toolbar">
              <button onClick={saveProof} disabled={saving}>
                {saving ? "Saving..." : "Save proof"}
              </button>
              <button onClick={captureCheckpoint} disabled={capturing}>
                {capturing ? "Capturing..." : "Capture checkpoint"}
              </button>
            </div>

            {message && <div className="status-pill">{message}</div>}
          </div>

          <div className="card stack">
            <h3>Final export notes</h3>
            <p className="muted">
              These are only for the end of the process. They are not meant to be filled out at every checkpoint.
            </p>

            <div>
              <label>What changed most across the whole process?</label>
              <textarea
                rows={3}
                value={finalAnswers.biggest_change}
                onChange={(e) =>
                  setFinalAnswers({ ...finalAnswers, biggest_change: e.target.value })
                }
                placeholder="Describe the biggest overall change from early drafts to the final version."
              />
            </div>

            <div>
              <label>What feedback, source, or input influenced the final version most?</label>
              <textarea
                rows={3}
                value={finalAnswers.most_helpful_input}
                onChange={(e) =>
                  setFinalAnswers({ ...finalAnswers, most_helpful_input: e.target.value })
                }
                placeholder="Mention the most important source, reading, feedback, or conversation."
              />
            </div>

            <div>
              <label>Anything you want your instructor to notice about your process?</label>
              <textarea
                rows={3}
                value={finalAnswers.instructor_context}
                onChange={(e) =>
                  setFinalAnswers({ ...finalAnswers, instructor_context: e.target.value })
                }
                placeholder="Optional context about effort, revision, or what changed over time."
              />
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card stack">
            <h3>Checkpoint capture</h3>
            <p className="muted">
              The goal is to keep this lightweight. One note, one optional moment answer, then capture.
            </p>

            <div>
              <label>Where did you work this session?</label>
              <select value={sourceTool} onChange={(e) => setSourceTool(e.target.value)}>
                <option value="google_docs">Google Docs</option>
                <option value="word">Microsoft Word</option>
                <option value="proofmode">ProofMode</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label>What changed in this session?</label>
              <textarea
                rows={3}
                value={checkpointNote}
                onChange={(e) => setCheckpointNote(e.target.value)}
                placeholder={
                  guidance?.suggested_checkpoint_note ||
                  "Write one short sentence about what changed."
                }
              />
            </div>

            <div className="question-box">
              <div className="question-meta">
                <span className="status-pill">
                  {guidance?.assignment_mode || submission.assignment_mode}
                </span>
                <span className="status-pill">{guidance?.stage || "starting"}</span>
                <span className="status-pill">
                  {guidance?.detected_change || "first_capture"}
                </span>
              </div>

              <strong>Moment question</strong>
              <p className="muted">
                {guidance?.dynamic_prompt ||
                  "Refresh guidance after you paste your latest draft."}
              </p>

              <textarea
                rows={3}
                value={momentAnswer}
                onChange={(e) => setMomentAnswer(e.target.value)}
                placeholder="Optional. Answer this only if it helps explain the moment."
              />

              <button
                className="secondary"
                onClick={() => loadGuidance(essayText)}
                disabled={refreshingGuidance}
              >
                {refreshingGuidance ? "Refreshing..." : "Refresh moment question"}
              </button>
            </div>

            <button onClick={captureCheckpoint} disabled={capturing}>
              {capturing ? "Capturing..." : "Capture proof-of-process checkpoint"}
            </button>
          </div>

          <div className="card stack">
            <h3>Evidence summary</h3>

            <div className="metric-grid">
              <div className="metric-card">
                <div className="metric-label">Checkpoints</div>
                <div className="metric-value">{summary.checkpoint_count}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Active days</div>
                <div className="metric-value">{summary.active_days}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Timespan</div>
                <div className="metric-value">{summary.timespan_days}d</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Major revisions</div>
                <div className="metric-value">{summary.major_revision_count}</div>
              </div>
            </div>

            <div className="status-row">
              <span className="muted">Evidence strength:</span>
              <span className="status-pill">{summary.evidence_strength}</span>
            </div>

            <p className="muted small">
              This is not an AI detector. It is a process record built from timestamped checkpoints,
              revision deltas, and context captured over time.
            </p>
          </div>

          <div className="card stack">
            <h3>Checkpoint timeline</h3>

            {groupedCheckpoints.length === 0 ? (
              <p className="muted">
                No checkpoints yet. Capture your first one after a real writing session.
              </p>
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
                            <span className="status-pill">{checkpoint.source_tool}</span>
                          </div>

                          <div className="chip-row">
                            <span className="chip">+{checkpoint.added_chars} chars</span>
                            <span className="chip">-{checkpoint.removed_chars} chars</span>
                            <span className="chip">
                              change {Math.round(checkpoint.change_ratio * 100)}%
                            </span>
                          </div>

                          {checkpoint.note && <p>{checkpoint.note}</p>}

                          {checkpoint.moment_prompt && (
                            <p className="muted small">
                              <strong>Moment question:</strong> {checkpoint.moment_prompt}
                            </p>
                          )}

                          {checkpoint.moment_answer && (
                            <p className="muted small">
                              <strong>Moment answer:</strong> {checkpoint.moment_answer}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card stack">
            <h3>Sharing and export</h3>
            <p className="muted">
              Private by default. Only enable sharing when you are ready to submit or show the proof.
            </p>

            <div className="toolbar">
              <button className="secondary" onClick={() => setVisibility("private")}>
                Private
              </button>
              <button className="secondary" onClick={() => setVisibility("share_pdf")}>
                Share PDF only
              </button>
              <button className="secondary" onClick={() => setVisibility("share_full")}>
                Share full proof
              </button>
            </div>

            <div className="status-row">
              <span className="muted">Visibility:</span>
              <span className="status-pill">{submission.visibility}</span>
            </div>

            {submission.share_enabled && submission.share_token && (
              <div>
                <label>Shared URL</label>
                <input
                  className="copy-field"
                  value={`${window.location.origin}/s/${submission.share_token}`}
                  readOnly
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
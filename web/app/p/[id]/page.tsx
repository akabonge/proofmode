"use client";

import { useEffect, useMemo, useState } from "react";
import { API, apiFetch, seedCsrf } from "../../../lib/api";
import { trackEvent } from "../../../lib/analytics";
import RichTextEditor, { extractPlainTextFromHtml } from "../../../components/rich-text-editor";
import {
  humanizeAssignmentMode,
  humanizeChangeType,
  humanizeEvidenceStrength,
  humanizeSourceTool,
  humanizeStage,
  humanizeVisibility,
} from "../../../lib/display";

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

type Submission = {
  id: string;
  title: string;
  assignment_mode: string;
  course?: string | null;
  assignment_prompt?: string | null;
  due_at?: string | null;
  essay_text?: string | null;
  student_name?: string | null;
  include_name_on_pdf?: boolean;
  visibility: string;
  share_enabled?: boolean;
  share_token?: string | null;
  answers?: {
    biggest_change?: string;
    most_helpful_input?: string;
    instructor_context?: string;
  } | null;
};

type FinalAnswers = {
  biggest_change: string;
  most_helpful_input: string;
  instructor_context: string;
};

type SaveSnapshot = {
  assignmentPrompt: string;
  dueAt: string;
  essayHtml: string;
  studentName: string;
  includeNameOnPdf: boolean;
  finalAnswers: FinalAnswers;
};

const DEFAULT_FINAL_ANSWERS: FinalAnswers = {
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

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function isUnauthorized(message: string) {
  return /401|unauthorized/i.test(message);
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

function buildSnapshot(values: SaveSnapshot): string {
  return JSON.stringify(values);
}

export default function ProofPage({ params }: { params: { id: string } }) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [summary, setSummary] = useState<EvidenceSummary | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [guidance, setGuidance] = useState<Guidance | null>(null);

  const [assignmentPrompt, setAssignmentPrompt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [essayHtml, setEssayHtml] = useState("<p></p>");
  const [studentName, setStudentName] = useState("");
  const [includeNameOnPdf, setIncludeNameOnPdf] = useState(false);
  const [sourceTool, setSourceTool] = useState("proofmode");
  const [checkpointNote, setCheckpointNote] = useState("");
  const [momentAnswer, setMomentAnswer] = useState("");
  const [finalAnswers, setFinalAnswers] = useState<FinalAnswers>(DEFAULT_FINAL_ANSWERS);

  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [refreshingGuidance, setRefreshingGuidance] = useState(false);
  const [message, setMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [loadedSnapshot, setLoadedSnapshot] = useState("");

  const pdfDownloadHref = useMemo(() => {
    return submission ? `${API}/v1/submissions/${submission.id}/pdf` : "#";
  }, [submission]);

  const shareUrl = useMemo(() => {
    if (!submission?.share_enabled || !submission.share_token) return "";
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://app.proofmode.co";
    return `${origin}/s/${submission.share_token}`;
  }, [submission]);

  const groupedCheckpoints = useMemo(() => groupCheckpointsByDay(checkpoints), [checkpoints]);
  const essayPlainText = useMemo(() => extractPlainTextFromHtml(essayHtml), [essayHtml]);
  const wordCount = useMemo(() => {
    if (!essayPlainText) return 0;
    return essayPlainText.split(/\s+/).filter(Boolean).length;
  }, [essayPlainText]);

  const lastCheckpointText = useMemo(() => {
    if (!summary?.last_checkpoint_at) return "No checkpoint captured yet.";
    return new Date(summary.last_checkpoint_at).toLocaleString();
  }, [summary]);
  const currentSnapshot = useMemo(
    () =>
      buildSnapshot({
        assignmentPrompt,
        dueAt,
        essayHtml,
        studentName,
        includeNameOnPdf,
        finalAnswers,
      }),
    [assignmentPrompt, dueAt, essayHtml, studentName, includeNameOnPdf, finalAnswers]
  );
  const hasUnsavedChanges = currentSnapshot !== loadedSnapshot;
  const saveStatusText = useMemo(() => {
    if (saving) return "Saving draft...";
    if (hasUnsavedChanges) return "Unsaved changes";
    if (!lastSavedAt) return "Not saved yet";
    return `Saved ${new Date(lastSavedAt).toLocaleString()}`;
  }, [hasUnsavedChanges, lastSavedAt, saving]);

  const nextStepText = useMemo(() => {
    const days = daysBetweenNow(summary?.last_checkpoint_at);

    if (summary?.checkpoint_count === 0) {
      return "Draft directly in ProofMode, then capture your first checkpoint when the first real version is ready.";
    }
    if (days === null) {
      return "Come back after your next real writing session and capture another checkpoint.";
    }
    if (days <= 0) {
      return "You already captured work today. Return after a later revision session or when the draft materially changes.";
    }
    if (days === 1) {
      return "It has been 1 day since your last checkpoint. Capture the next version after today's writing session.";
    }
    return `It has been ${days} days since your last checkpoint. Reopen this proof after your next real writing session and capture the new version.`;
  }, [summary]);

  async function loadGuidance(currentDraft: string, quiet = false) {
    try {
      setRefreshingGuidance(true);

      const data = await apiFetch<Guidance>(
        `/v1/submissions/${params.id}/guidance`,
        {
          method: "POST",
          body: JSON.stringify({ current_draft: currentDraft }),
        },
        true
      );

      setGuidance(data);

      if (!checkpointNote.trim() && data?.suggested_checkpoint_note) {
        setCheckpointNote(data.suggested_checkpoint_note);
      }
    } catch (err) {
      const message = getErrorMessage(err, "Could not refresh moment question.");

      if (isUnauthorized(message)) {
        window.location.href = "/login";
        return;
      }

      setGuidance(null);
      if (!quiet) setMessage(message);
    } finally {
      setRefreshingGuidance(false);
    }
  }

  async function loadAll() {
    try {
      setMessage("");

      const [sub, summaryData, checkpointData] = await Promise.all([
        apiFetch<Submission>(`/v1/submissions/${params.id}`),
        apiFetch<EvidenceSummary>(`/v1/submissions/${params.id}/evidence-summary`),
        apiFetch<Checkpoint[]>(`/v1/submissions/${params.id}/checkpoints`),
      ]);

      setSubmission(sub);
      setSummary(summaryData);
      setCheckpoints(Array.isArray(checkpointData) ? checkpointData : []);

      setAssignmentPrompt(sub.assignment_prompt || "");
      setDueAt(sub.due_at ? new Date(sub.due_at).toISOString().slice(0, 16) : "");
      setEssayHtml(renderPreviewHtml(sub.essay_text || ""));
      setStudentName(sub.student_name || "");
      setIncludeNameOnPdf(Boolean(sub.include_name_on_pdf));
      const nextFinalAnswers = {
        biggest_change: sub.answers?.biggest_change || "",
        most_helpful_input: sub.answers?.most_helpful_input || "",
        instructor_context: sub.answers?.instructor_context || "",
      };
      setFinalAnswers(nextFinalAnswers);
      setLastSavedAt(sub.updated_at || null);
      setLoadedSnapshot(
        buildSnapshot({
          assignmentPrompt: sub.assignment_prompt || "",
          dueAt: sub.due_at ? new Date(sub.due_at).toISOString().slice(0, 16) : "",
          essayHtml: renderPreviewHtml(sub.essay_text || ""),
          studentName: sub.student_name || "",
          includeNameOnPdf: Boolean(sub.include_name_on_pdf),
          finalAnswers: nextFinalAnswers,
        })
      );

      await loadGuidance(sub.essay_text || "", true);
    } catch (err) {
      const message = getErrorMessage(err, "Could not load this proof page.");

      if (isUnauthorized(message)) {
        window.location.href = "/login";
        return;
      }

      setMessage(message);
    }
  }

  useEffect(() => {
    seedCsrf().catch(() => {});
    loadAll();
    trackEvent("proof_opened", { path: `/p/${params.id}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving) {
          void saveProof();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function saveProof() {
    if (!submission) return;

    try {
      setSaving(true);
      setMessage("Saving draft...");

      await apiFetch(
        `/v1/submissions/${params.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            assignment_prompt: assignmentPrompt,
            due_at: dueAt ? new Date(dueAt).toISOString() : null,
            essay_text: essayHtml,
            student_name: studentName,
            include_name_on_pdf: includeNameOnPdf,
          }),
        },
        true
      );

      await apiFetch(
        `/v1/submissions/${params.id}/answers`,
        {
          method: "PUT",
          body: JSON.stringify({ answers: finalAnswers }),
        },
        true
      );

      await loadAll();
      setLastSavedAt(new Date().toISOString());
      setMessage("Draft saved.");
    } catch (err) {
      const message = getErrorMessage(err, "Could not save proof.");

      if (isUnauthorized(message)) {
        window.location.href = "/login";
        return;
      }

      setMessage(message);
    } finally {
      setSaving(false);
    }
  }

  async function captureCheckpoint() {
    if (!essayPlainText.trim()) {
      setMessage("Write some real draft content before capturing a checkpoint.");
      return;
    }

    try {
      setCapturing(true);
      setMessage("Capturing checkpoint...");

      await apiFetch(
        `/v1/submissions/${params.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            assignment_prompt: assignmentPrompt,
            due_at: dueAt ? new Date(dueAt).toISOString() : null,
            essay_text: essayHtml,
            student_name: studentName,
            include_name_on_pdf: includeNameOnPdf,
          }),
        },
        true
      );

      await apiFetch(
        `/v1/submissions/${params.id}/checkpoints`,
        {
          method: "POST",
          body: JSON.stringify({
            source_tool: sourceTool,
            draft_text: essayHtml,
            note: checkpointNote,
            moment_answer: momentAnswer,
          }),
        },
        true
      );

      await trackEvent("checkpoint_captured", {
        path: `/p/${params.id}`,
        metadata: {
          source_tool: sourceTool,
          has_note: Boolean(checkpointNote.trim()),
          has_moment_answer: Boolean(momentAnswer.trim()),
        },
      });

      setMomentAnswer("");
      setCheckpointNote("");
      await loadAll();
      setMessage("Checkpoint captured.");
    } catch (err) {
      const message = getErrorMessage(err, "Could not capture checkpoint.");

      if (isUnauthorized(message)) {
        window.location.href = "/login";
        return;
      }

      setMessage(message);
    } finally {
      setCapturing(false);
    }
  }

  async function setVisibility(visibility: string) {
    try {
      const updated = await apiFetch<Submission>(
        `/v1/submissions/${params.id}/share`,
        {
          method: "POST",
          body: JSON.stringify({ visibility }),
        },
        true
      );

      setSubmission(updated);
      await trackEvent("proof_shared", {
        path: `/p/${params.id}`,
        metadata: { visibility },
      });
      setMessage("Sharing updated.");
    } catch (err) {
      const message = getErrorMessage(err, "Could not update sharing.");

      if (isUnauthorized(message)) {
        window.location.href = "/login";
        return;
      }

      setMessage(message);
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
    <main className="shell writer-page">
      <div className="topnav">
        <div>
          <h2 className="page-title">{submission.title}</h2>
          <div className="subtitle">
            {humanizeAssignmentMode(submission.assignment_mode)}
            {submission.course ? ` - ${submission.course}` : ""}
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

      <div className="card writer-summary-card spaced-lg">
        <div className="writer-summary-copy">
          <div className="badge">Pilot writing workspace</div>
          <p className="muted">
            A familiar, document-first editor for the pilot. The writing canvas stays central while ProofMode process features live in the side panel.
          </p>
        </div>
        <div className="writer-summary-grid">
          <div className="writer-highlight">
            <div className="metric-label">Save status</div>
            <div className="small muted">{saveStatusText}</div>
          </div>
          <div className="writer-highlight">
            <div className="metric-label">Last checkpoint</div>
            <div className="small muted">{lastCheckpointText}</div>
          </div>
          <div className="writer-highlight">
            <div className="metric-label">Word count</div>
            <div className="metric-value">{wordCount}</div>
          </div>
          <div className="writer-highlight">
            <div className="metric-label">Evidence strength</div>
            <div className="metric-value">{humanizeEvidenceStrength(summary.evidence_strength)}</div>
          </div>
          <div className="writer-highlight writer-highlight-wide">
            <div className="metric-label">Next best step</div>
            <div className="small muted">{nextStepText}</div>
          </div>
        </div>
      </div>

      <div className="workspace-grid">
        <div className="stack">
          <div className="card stack writer-card">
            <div className="writer-header">
              <div>
                <h3>Document canvas</h3>
                <p className="muted small">
                  Write here directly in a larger, familiar workspace. Use <strong>Ctrl/Cmd + S</strong> to save at any time.
                </p>
              </div>
              <div className="chip-row">
                <span className="chip">{humanizeAssignmentMode(submission.assignment_mode)}</span>
                <span className="chip">{wordCount} words</span>
                <span className="chip">
                  {hasUnsavedChanges ? "Unsaved changes" : "Saved"}
                </span>
              </div>
            </div>

            <RichTextEditor
              value={essayHtml}
              onChange={setEssayHtml}
              placeholder="Start your draft here. ProofMode will track your writing process over time while keeping the interface familiar and simple."
            />

            <div className="writer-footer">
              <div className="writer-status-copy">
                <div className="muted small">{saveStatusText}</div>
                <div className="muted small">
                  Capture checkpoints after meaningful writing sessions, not every tiny edit.
                </div>
              </div>
              <div className="toolbar">
                <button onClick={saveProof} disabled={saving}>
                  {saving ? "Saving..." : "Save draft"}
                </button>
                <button onClick={captureCheckpoint} disabled={capturing}>
                  {capturing ? "Capturing..." : "Capture checkpoint"}
                </button>
              </div>
            </div>

            {message && <div className="status-pill">{message}</div>}
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
                            <span className="status-pill">
                              {humanizeSourceTool(checkpoint.source_tool)}
                            </span>
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
        </div>

        <div className="stack sidebar-stack">
          <div className="card stack">
            <h3>Proof settings</h3>

            <div>
              <label>Assignment prompt or rubric</label>
              <textarea
                rows={5}
                value={assignmentPrompt}
                onChange={(e) => setAssignmentPrompt(e.target.value)}
                placeholder="Paste the assignment instructions here."
              />
            </div>

            <div className="grid-two">
              <div>
                <label>Due date</label>
                <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>

              <div>
                <label>Student name</label>
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
          </div>

          <div className="card stack">
            <h3>Checkpoint capture</h3>
            <p className="muted">
              Keep the process light. Capture after real work, not every tiny edit.
            </p>

            <div>
              <label>Where did you work this session?</label>
              <select value={sourceTool} onChange={(e) => setSourceTool(e.target.value)}>
                <option value="proofmode">ProofMode editor</option>
                <option value="google_docs">Google Docs</option>
                <option value="word">Microsoft Word</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label>What changed in this session?</label>
              <textarea
                rows={3}
                value={checkpointNote}
                onChange={(e) => setCheckpointNote(e.target.value)}
                placeholder={guidance?.suggested_checkpoint_note || "Write one short sentence about what changed."}
              />
            </div>

            <div className="question-box">
              <div className="question-meta">
                <span className="status-pill">
                  {humanizeAssignmentMode(guidance?.assignment_mode || submission.assignment_mode)}
                </span>
                <span className="status-pill">{humanizeStage(guidance?.stage || "starting")}</span>
                <span className="status-pill">
                  {humanizeChangeType(guidance?.detected_change || "first_capture")}
                </span>
              </div>

              <strong>Moment question</strong>
              <p className="muted">
                {guidance?.dynamic_prompt || "Refresh guidance after your draft starts taking shape."}
              </p>

              <textarea
                rows={3}
                value={momentAnswer}
                onChange={(e) => setMomentAnswer(e.target.value)}
                placeholder="Optional. Use this when you want to explain a meaningful decision or revision."
              />

              <button
                className="secondary"
                onClick={() => loadGuidance(essayHtml)}
                disabled={refreshingGuidance}
              >
                {refreshingGuidance ? "Refreshing..." : "Refresh moment question"}
              </button>
            </div>
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
              <span className="status-pill">{humanizeEvidenceStrength(summary.evidence_strength)}</span>
            </div>

            <p className="muted small">
              ProofMode is not trying to detect AI. It records how the writing evolved across real sessions.
            </p>
          </div>

          <div className="card stack">
            <h3>Final export notes</h3>
            <p className="muted">
              These are for the end of the process, not every session.
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

          <div className="card stack">
            <h3>Sharing and export</h3>
            <p className="muted">
              Private by default. Share only when you are ready to submit or review.
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
              <span className="status-pill">{humanizeVisibility(submission.visibility)}</span>
            </div>

            {submission.share_enabled && submission.share_token && (
              <div>
                <label>Shared URL</label>
                <input className="copy-field" value={shareUrl} readOnly />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

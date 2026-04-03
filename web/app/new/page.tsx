"use client";

import { useState } from "react";
import { apiFetch, seedCsrf } from "../../lib/api";

export default function NewProofPage() {
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [assignmentType, setAssignmentType] = useState("writing");
  const [assignmentPrompt, setAssignmentPrompt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      setSubmitting(true);
      await seedCsrf();

      const res = await apiFetch("/v1/submissions", {
        method: "POST",
        body: JSON.stringify({
          title: title || "Untitled",
          course: course || null,
          assignment_type: assignmentType,
          assignment_prompt: assignmentPrompt || null,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Could not create proof.");
        return;
      }

      const created = await res.json();
      window.location.href = `/p/${created.id}`;
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <div className="card" style={{ maxWidth: 860, margin: "40px auto" }}>
        <h2>Create a new proof</h2>
        <p className="muted">
          Start once, then come back after real writing sessions to capture checkpoints over time.
        </p>

        <form className="stack spaced-lg" onSubmit={onSubmit}>
          <div className="grid-two">
            <div>
              <label>Assignment title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="English Essay"
              />
            </div>

            <div>
              <label>Course</label>
              <input
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="ENGL 000"
              />
            </div>
          </div>

          <div className="grid-two">
            <div>
              <label>Assignment type</label>
              <select value={assignmentType} onChange={(e) => setAssignmentType(e.target.value)}>
                <option value="writing">General writing</option>
                <option value="essay">Essay</option>
                <option value="memo">Memo</option>
                <option value="proposal">Proposal</option>
                <option value="research">Research paper</option>
                <option value="reflection">Reflection</option>
                <option value="lab">Lab/report</option>
                <option value="discussion">Discussion post</option>
              </select>
            </div>

            <div>
              <label>Due date (optional)</label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label>Assignment prompt or rubric</label>
            <textarea
              rows={8}
              value={assignmentPrompt}
              onChange={(e) => setAssignmentPrompt(e.target.value)}
              placeholder="Paste the assignment prompt, rubric, or instructions here. ProofMode uses this to make checkpoint guidance more specific to the actual work."
            />
          </div>

          {error && <p className="field-error">{error}</p>}

          <div className="toolbar">
            <button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create proof"}
            </button>
            <a className="btn secondary" href="/dashboard">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}
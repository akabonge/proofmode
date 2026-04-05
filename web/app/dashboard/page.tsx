"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Submission = {
  id: string;
  title?: string;
  course?: string | null;
  assignment_mode?: string | null;
  updated_at?: string | null;
  visibility?: string | null;
};

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function isUnauthorized(message: string) {
  return /401|unauthorized/i.test(message);
}

export default function DashboardPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch<Submission[]>("/v1/submissions");

        if (!cancelled) {
          setItems(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        const message = getErrorMessage(err, "Could not load dashboard.");

        if (isUnauthorized(message)) {
          window.location.href = "/login";
          return;
        }

        if (!cancelled) {
          setError(message);
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
  }, []);

  return (
    <main className="shell">
      <div className="topnav">
        <div>
          <h2 className="page-title">Your proofs</h2>
          <div className="subtitle">
            Track writing progress over time and return after real work sessions.
          </div>
        </div>

        <div className="toolbar">
          <a className="btn" href="/new">
            Create new proof
          </a>
        </div>
      </div>

      {loading ? (
        <div className="card stack">
          <h3>Loading dashboard...</h3>
        </div>
      ) : error ? (
        <div className="card stack">
          <h3>Could not load dashboard</h3>
          <p className="field-error">{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card stack spaced-lg">
          <div className="badge">No submissions yet</div>
          <h3>Start your first proof</h3>
          <p className="muted">
            Create a proof for an essay, memo, proposal, or other writing assignment.
            Then return after real writing sessions to capture checkpoints over time.
          </p>

          <div className="toolbar">
            <a className="btn" href="/new">
              Begin a new submission
            </a>
          </div>
        </div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <a
              key={item.id}
              href={`/p/${item.id}`}
              className="card stack"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="toolbar" style={{ justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ marginBottom: 6 }}>{item.title || "Untitled submission"}</h3>
                  <div className="subtitle">
                    {item.assignment_mode || "writing"}
                    {item.course ? ` • ${item.course}` : ""}
                  </div>
                </div>

                <span className="status-pill">{item.visibility || "private"}</span>
              </div>

              <p className="muted small">
                {item.updated_at
                  ? `Last updated ${new Date(item.updated_at).toLocaleString()}`
                  : "No recent activity"}
              </p>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
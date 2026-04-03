"use client";

import { useEffect, useState } from "react";
import { apiFetch, seedCsrf } from "../../lib/api";

export default function DashboardPage() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    seedCsrf();
    (async () => {
      const res = await apiFetch("/v1/submissions");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      setItems(data);
    })();
  }, []);

  return (
    <main className="shell">
      <div className="topnav">
        <div>
          <h2 className="page-title">Your proofs</h2>
          <div className="subtitle">
            Write anywhere. Capture checkpoints over time. Export proof when ready.
          </div>
        </div>

        <div className="toolbar">
          <a className="btn" href="/new">
            New proof
          </a>
        </div>
      </div>

      <div className="card stack spaced-lg">
        <div className="badge">Low-friction workflow</div>
        <p className="muted">
          Use Google Docs or Word if that is what you already use. Come here after real writing sessions,
          paste the latest draft, and capture a checkpoint in under a minute.
        </p>
      </div>

      <div className="stack spaced-lg">
        {items.length === 0 ? (
          <div className="card">
            <h3>No proofs yet</h3>
            <p className="muted">
              Start an assignment once, then build evidence over time instead of recreating your process later.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="card stack">
              <div className="topnav" style={{ padding: 0 }}>
                <div>
                  <h3>{item.title}</h3>
                  <div className="subtitle">
                    {item.assignment_mode} {item.course ? `• ${item.course}` : ""}
                  </div>
                </div>
                <a className="btn secondary" href={`/p/${item.id}`}>
                  Open
                </a>
              </div>

              <div className="chip-row">
                <span className="chip">checkpoints: {item.checkpoint_count ?? 0}</span>
                <span className="chip">active days: {item.active_days ?? 0}</span>
                <span className="chip">evidence: {item.evidence_strength ?? "low"}</span>
              </div>

              <p className="muted small">
                {item.last_checkpoint_at
                  ? `Last checkpoint: ${new Date(item.last_checkpoint_at).toLocaleString()}`
                  : "No checkpoint captured yet."}
              </p>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
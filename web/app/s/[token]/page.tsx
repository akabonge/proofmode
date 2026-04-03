"use client";

import { useEffect, useState } from "react";
import { apiFetch, API } from "../../../lib/api";

export default function SharedPage({ params }: { params: { token: string } }) {
  const [proof, setProof] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const res = await apiFetch(`/v1/share/${params.token}`);
      if (!res.ok) return;
      setProof(await res.json());
    })();
  }, [params.token]);

  if (!proof) {
    return <main className="shell"><div className="card">Shared proof not found.</div></main>;
  }

  return (
    <main className="shell">
      <div className="card stack">
        <span className="badge">Shared proof</span>
        <h2>{proof.title}</h2>
        <div className="muted">{proof.assignment_type} {proof.course ? `• ${proof.course}` : ""}</div>
        <a className="btn" href={`${API}/v1/share/${params.token}/pdf`} target="_blank">Open PDF</a>
        {proof.visibility === "share_full" && proof.answers && Object.keys(proof.answers).length > 0 && (
          <pre style={{whiteSpace: "pre-wrap", background: "#10172b", padding: 16, borderRadius: 12}}>
            {JSON.stringify(proof.answers, null, 2)}
          </pre>
        )}
      </div>
    </main>
  );
}

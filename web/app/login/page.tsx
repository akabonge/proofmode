"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, seedCsrf } from "../../lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    seedCsrf();
  }, []);

  const canSubmit = useMemo(() => {
    return Boolean(email.trim()) && Boolean(password) && !submitting;
  }, [email, password, submitting]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      setSubmitting(true);

      const res = await apiFetch("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
          setError("Incorrect email or password.");
          return;
        }

        if (res.status === 403) {
          setError("Your session security check expired. Refresh the page and try again.");
          return;
        }

        setError(data.detail || "Could not log in.");
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Could not reach the server. Check that the app is still running.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <div className="card" style={{ maxWidth: 720, margin: "40px auto" }}>
        <h2>Log in</h2>
        <p className="muted">
          Access your saved proofs, exports, and sharing settings.
        </p>

        <form className="stack" onSubmit={onSubmit}>
          <div>
            <label>Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.edu"
            />
          </div>

          <div>
            <label>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={!canSubmit}>
            {submitting ? "Logging in..." : "Log in"}
          </button>
        </form>

        <div className="info-block" style={{ marginTop: 18 }}>
          <strong>Security notes</strong>
          <ul className="info-list">
            <li>Passwords are hashed and never stored in plain text.</li>
            <li>Essay text and process answers are encrypted in storage.</li>
            <li>Sharing is private by default and only enabled when you choose.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
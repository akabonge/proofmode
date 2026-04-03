"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, seedCsrf } from "../../lib/api";

const MIN_PASSWORD_LENGTH = 10;

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    seedCsrf();
  }, []);

  const canSubmit = useMemo(() => {
    return Boolean(email.trim()) && password.length >= MIN_PASSWORD_LENGTH && consent && !submitting;
  }, [email, password, consent, submitting]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError("Password must be at least 10 characters.");
      return;
    }

    try {
      setSubmitting(true);

      const res = await apiFetch("/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          consent_version: "v1",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));

        if (res.status === 403) {
          setError("Your session security check expired. Refresh the page and try again.");
          return;
        }

        if (res.status === 422) {
          setError("Password must be at least 10 characters.");
          return;
        }

        setError(data.detail || "Could not create account.");
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <div className="card" style={{ maxWidth: 720, margin: "40px auto" }}>
        <h2>Create account</h2>
        <form className="stack" onSubmit={onSubmit}>
          <div>
            <label>Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label>Password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              minLength={MIN_PASSWORD_LENGTH}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I understand this is a pilot and agree to the privacy notice.
          </label>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" disabled={!canSubmit}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>
      </div>
    </main>
  );
}
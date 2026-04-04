"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!agree) {
      setError("You must agree to the privacy notice.");
      return;
    }

    try {
      setLoading(true);
      await registerUser(email.trim(), password);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to create account.";

      if (/csrf/i.test(message)) {
        setError("Your session security check expired. Refresh the page and try again.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <div className="card" style={{ maxWidth: 860, margin: "40px auto" }}>
        <h2>Create account</h2>
        <p className="muted">
          Start a secure ProofMode account to capture writing checkpoints over time.
        </p>

        <form className="stack spaced-lg" onSubmit={onSubmit}>
          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Create a password"
              required
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span>I understand this is a pilot and agree to the privacy notice.</span>
          </label>

          {error && <p className="field-error">{error}</p>}

          <div className="toolbar">
            <button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create account"}
            </button>
            <a className="btn secondary" href="/login">
              Already have an account?
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}
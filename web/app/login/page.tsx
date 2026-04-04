"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginUser } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    try {
      setLoading(true);
      await loginUser(email.trim(), password);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to sign in.";

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
        <h2>Sign in</h2>
        <p className="muted">
          Return to your ProofMode dashboard and continue building your proof-of-process.
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
              autoComplete="current-password"
              placeholder="Enter your password"
              required
            />
          </div>

          {error && <p className="field-error">{error}</p>}

          <div className="toolbar">
            <button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
            <a className="btn secondary" href="/signup">
              Create account
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}
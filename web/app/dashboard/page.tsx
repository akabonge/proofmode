"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Submission = {
  id: string;
  title?: string;
  prompt_type?: string;
  updated_at?: string;
};

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
        const message =
          err instanceof Error ? err.message : "Failed to load dashboard.";

        if (/401|unauthorized/i.test(message)) {
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

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div>
      {items.length === 0 ? (
        <p>No submissions yet.</p>
      ) : (
        items.map((item) => (
          <div key={item.id}>
            <strong>{item.title || "Untitled submission"}</strong>
          </div>
        ))
      )}
    </div>
  );
}
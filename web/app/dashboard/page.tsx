"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch, getSession } from "@/lib/api";

type Submission = {
  id: string;
  title?: string;
  course?: string | null;
  assignment_mode?: string | null;
  updated_at?: string | null;
  visibility?: string | null;
};

type SessionUser = {
  id: string;
  email: string;
  role: string;
};

type AnalyticsDashboard = {
  generated_at: string;
  kpis: {
    total_users: number;
    new_users_7d: number;
    total_submissions: number;
    total_checkpoints: number;
    shared_proofs: number;
    total_events: number;
    unique_visitors_30d: number;
    active_writers_30d: number;
  };
  funnel: Array<{
    label: string;
    value: number;
  }>;
  daily_activity: Array<{
    date: string;
    page_views: number;
    signups: number;
    proofs_created: number;
    checkpoints_captured: number;
  }>;
  top_pages: Array<{
    path: string;
    views: number;
  }>;
  assignment_modes: Array<{
    mode: string;
    count: number;
  }>;
  recent_events: Array<{
    id: string;
    event_name: string;
    path?: string | null;
    created_at: string;
    user_email?: string | null;
    session_id?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  }>;
};

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function isUnauthorized(message: string) {
  return /401|unauthorized|not authenticated/i.test(message);
}

function isAdminRole(role?: string) {
  return role === "admin" || role === "judge";
}

function formatEventName(eventName: string) {
  return eventName
    .replace(/^page_view:/, "page view ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMode(mode: string) {
  return mode.replace(/_/g, " ");
}

function formatShortDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function AdminAnalyticsPanel({ analytics }: { analytics: AnalyticsDashboard }) {
  const maxFunnel = Math.max(...analytics.funnel.map((step) => step.value), 1);
  const maxDaily = Math.max(
    ...analytics.daily_activity.map(
      (day) => day.page_views + day.signups + day.proofs_created + day.checkpoints_captured
    ),
    1
  );

  const summaryCards = [
    { label: "Total users", value: analytics.kpis.total_users, hint: `+${analytics.kpis.new_users_7d} this week` },
    { label: "Unique visitors", value: analytics.kpis.unique_visitors_30d, hint: "last 30 days" },
    { label: "Proofs created", value: analytics.kpis.total_submissions, hint: `${analytics.kpis.shared_proofs} shared` },
    { label: "Checkpoints", value: analytics.kpis.total_checkpoints, hint: `${analytics.kpis.active_writers_30d} active writers` },
  ];

  return (
    <div className="stack spaced-lg">
      <div className="card stack">
        <div className="badge">Admin analytics</div>
        <h2>Pitch dashboard</h2>
        <p className="muted">
          This is first-party product analytics from ProofMode itself: visits, signups, proof creation,
          checkpoint capture, and sharing activity.
        </p>

        <div className="admin-stat-grid">
          {summaryCards.map((card) => (
            <div key={card.label} className="admin-stat-card">
              <div className="admin-stat-label">{card.label}</div>
              <div className="admin-stat-value">{card.value}</div>
              <div className="muted small">{card.hint}</div>
            </div>
          ))}
        </div>

        <div className="admin-inline-meta">
          <span className="status-pill">{analytics.kpis.total_events} tracked events</span>
          <span className="status-pill">
            Updated {new Date(analytics.generated_at).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="row admin-row">
        <div className="stack">
          <div className="card stack">
            <h3>Adoption funnel</h3>
            <div className="analytics-list">
              {analytics.funnel.map((step) => (
                <div key={step.label} className="analytics-row">
                  <div className="analytics-row-head">
                    <span>{step.label}</span>
                    <strong>{step.value}</strong>
                  </div>
                  <div className="analytics-bar-shell">
                    <div
                      className="analytics-bar-fill"
                      style={{ width: `${(step.value / maxFunnel) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card stack">
            <h3>Last 14 days</h3>
            <div className="daily-grid">
              {analytics.daily_activity.map((day) => {
                const total =
                  day.page_views + day.signups + day.proofs_created + day.checkpoints_captured;

                return (
                  <div key={day.date} className="daily-card">
                    <div className="daily-card-head">
                      <strong>{formatShortDate(day.date)}</strong>
                      <span className="muted small">{total} actions</span>
                    </div>

                    <div className="analytics-bar-shell tall">
                      <div
                        className="analytics-bar-fill"
                        style={{ width: `${(total / maxDaily) * 100}%` }}
                      />
                    </div>

                    <div className="daily-metrics">
                      <span>Views {day.page_views}</span>
                      <span>Signups {day.signups}</span>
                      <span>Proofs {day.proofs_created}</span>
                      <span>Checks {day.checkpoints_captured}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card stack">
            <h3>Most visited pages</h3>
            {analytics.top_pages.length === 0 ? (
              <p className="muted">No page view data yet.</p>
            ) : (
              <div className="analytics-list">
                {analytics.top_pages.map((page) => (
                  <div key={page.path} className="analytics-row compact">
                    <div className="analytics-row-head">
                      <span>{page.path}</span>
                      <strong>{page.views}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card stack">
            <h3>Assignment mix</h3>
            {analytics.assignment_modes.length === 0 ? (
              <p className="muted">No proofs created yet.</p>
            ) : (
              <div className="chip-row">
                {analytics.assignment_modes.map((mode) => (
                  <span key={mode.mode} className="chip">
                    {formatMode(mode.mode)}: {mode.count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card stack">
        <h3>Recent product activity</h3>
        {analytics.recent_events.length === 0 ? (
          <p className="muted">No tracked activity yet.</p>
        ) : (
          <div className="stack">
            {analytics.recent_events.map((event) => (
              <div key={event.id} className="timeline-item">
                <div className="timeline-meta">
                  <strong>{formatEventName(event.event_name)}</strong>
                  <span className="muted small">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="chip-row">
                  {event.path ? <span className="chip">{event.path}</span> : null}
                  {event.user_email ? <span className="chip">{event.user_email}</span> : null}
                  {event.metadata &&
                    Object.entries(event.metadata).map(([key, value]) => (
                      <span key={key} className="chip">
                        {key.replace(/_/g, " ")}: {String(value)}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProofList({ items }: { items: Submission[] }) {
  if (items.length === 0) {
    return (
      <div className="card stack spaced-lg">
        <div className="badge">No submissions yet</div>
        <h3>Start your first proof</h3>
        <p className="muted">
          Create a proof for an essay, memo, proposal, or other writing assignment. Then return
          after real writing sessions to capture checkpoints over time.
        </p>

        <div className="toolbar">
          <a className="btn" href="/new">
            Begin a new submission
          </a>
        </div>
      </div>
    );
  }

  return (
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
                {item.course ? ` - ${item.course}` : ""}
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
  );
}

export default function DashboardPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const adminView = useMemo(() => isAdminRole(user?.role), [user?.role]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const session = (await getSession()) as SessionUser;

        if (cancelled) return;
        setUser(session);

        const requests: Promise<unknown>[] = [apiFetch<Submission[]>("/v1/submissions")];
        if (isAdminRole(session.role)) {
          requests.push(apiFetch<AnalyticsDashboard>("/v1/admin/analytics"));
        }

        const [submissionData, analyticsData] = await Promise.all(requests);

        if (!cancelled) {
          setItems(Array.isArray(submissionData) ? submissionData : []);
          setAnalytics((analyticsData as AnalyticsDashboard) || null);
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
          <h2 className="page-title">
            {adminView ? "ProofMode admin dashboard" : "Your proofs"}
          </h2>
          <div className="subtitle">
            {adminView
              ? "Show judges live traction, writing activity, and proof-of-process engagement."
              : "Track writing progress over time and return after real work sessions."}
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
      ) : (
        <div className="stack">
          {adminView && analytics ? <AdminAnalyticsPanel analytics={analytics} /> : null}

          <div className="card stack">
            <div className="toolbar" style={{ justifyContent: "space-between" }}>
              <div>
                <h3 style={{ marginBottom: 6 }}>
                  {adminView ? "Your demo account proofs" : "Your proof list"}
                </h3>
                <p className="muted small">
                  {user?.email ? `Signed in as ${user.email}` : "Signed in"}
                </p>
              </div>
              {user?.role ? <span className="status-pill">{user.role}</span> : null}
            </div>
          </div>

          <ProofList items={items} />
        </div>
      )}
    </main>
  );
}

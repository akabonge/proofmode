"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch, getSession } from "@/lib/api";
import {
  formatPercent,
  humanizeAssignmentMode,
  humanizeEventName,
  humanizePath,
  humanizeVisibility,
} from "@/lib/display";

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
    active_users_7d: number;
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
  recent_users: Array<{
    email: string;
    role: string;
    created_at: string;
    last_seen_at?: string | null;
    submissions_created: number;
    checkpoints_captured: number;
    is_recently_active: boolean;
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

function formatShortDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatMetadataKey(key: string) {
  return key.replace(/_/g, " ");
}

function formatRole(role?: string) {
  if (!role) return "";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatLastSeen(value?: string | null) {
  if (!value) return "No tracked activity yet";
  return new Date(value).toLocaleString();
}

function AdminAnalyticsPanel({ analytics }: { analytics: AnalyticsDashboard }) {
  const maxFunnel = Math.max(...analytics.funnel.map((step) => step.value), 1);
  const maxDaily = Math.max(
    ...analytics.daily_activity.map(
      (day) => day.page_views + day.signups + day.proofs_created + day.checkpoints_captured
    ),
    1
  );
  const totalAssignmentModes = analytics.assignment_modes.reduce((sum, mode) => sum + mode.count, 0) || 1;

  const executiveCards = [
    {
      label: "Active visitors",
      value: analytics.kpis.unique_visitors_30d,
      hint: "People who visited in the last 30 days",
    },
    {
      label: "New accounts",
      value: analytics.kpis.new_users_7d,
      hint: "Created in the last 7 days",
    },
    {
      label: "Active users",
      value: analytics.kpis.active_users_7d,
      hint: "Logged in or worked in the last 7 days",
    },
    {
      label: "Proofs created",
      value: analytics.kpis.total_submissions,
      hint: `${analytics.kpis.shared_proofs} currently shared`,
    },
  ];

  return (
    <div className="stack spaced-lg">
      <div className="card stack">
        <div className="badge">Admin analytics</div>
        <h2>Product health dashboard</h2>
        <p className="muted">
          A first-party view of traction, engagement, and writing-process activity. This is designed
          to answer the questions a judge, professor, or investor would ask in a quick walkthrough.
        </p>

        <div className="admin-stat-grid">
          {executiveCards.map((card) => (
            <div key={card.label} className="admin-stat-card">
              <div className="admin-stat-label">{card.label}</div>
              <div className="admin-stat-value">{card.value}</div>
              <div className="muted small">{card.hint}</div>
            </div>
          ))}
        </div>

        <div className="admin-inline-meta">
          <span className="status-pill">{analytics.kpis.total_users} total users</span>
          <span className="status-pill">{analytics.kpis.active_writers_30d} active writers (30d)</span>
          <span className="status-pill">{analytics.kpis.total_events} tracked product events</span>
          <span className="status-pill">
            Refreshed {new Date(analytics.generated_at).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="row admin-row">
        <div className="stack">
          <div className="card stack">
            <div className="section-head">
              <div>
                <h3>Acquisition to activation</h3>
                <p className="muted small">
                  Last 30 days. This view is aligned to real product milestones instead of raw event names.
                </p>
              </div>
            </div>

            <div className="analytics-list">
              {analytics.funnel.map((step, index) => {
                const previous = index === 0 ? step.value : analytics.funnel[index - 1].value;
                const conversion = previous > 0 ? (step.value / previous) * 100 : 0;

                return (
                  <div key={step.label} className="analytics-row">
                    <div className="analytics-row-head">
                      <span>{step.label}</span>
                      <div className="analytics-row-value">
                        <strong>{step.value}</strong>
                        {index > 0 ? (
                          <span className="analytics-rate">{formatPercent(conversion)}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="analytics-bar-shell">
                      <div
                        className="analytics-bar-fill"
                        style={{ width: `${(step.value / maxFunnel) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card stack">
            <div className="section-head">
              <div>
                <h3>Daily momentum</h3>
                <p className="muted small">
                  Last 14 days across visits, sign-ups, proof creation, and checkpoint capture.
                </p>
              </div>
            </div>

            <div className="daily-grid">
              {analytics.daily_activity.map((day) => {
                const total =
                  day.page_views + day.signups + day.proofs_created + day.checkpoints_captured;

                return (
                  <div key={day.date} className="daily-card">
                    <div className="daily-card-head">
                      <strong>{formatShortDate(day.date)}</strong>
                      <span className="muted small">{total} tracked actions</span>
                    </div>

                    <div className="analytics-bar-shell tall">
                      <div
                        className="analytics-bar-fill"
                        style={{ width: `${(total / maxDaily) * 100}%` }}
                      />
                    </div>

                    <div className="daily-metrics">
                      <span>Visits {day.page_views}</span>
                      <span>Sign-ups {day.signups}</span>
                      <span>Proofs {day.proofs_created}</span>
                      <span>Checkpoints {day.checkpoints_captured}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card stack">
            <div className="section-head">
              <div>
                <h3>User overview</h3>
                <p className="muted small">
                  This is the account list behind the totals above. It shows who has signed up and who has
                  actually used the product recently.
                </p>
              </div>
            </div>

            {analytics.recent_users.length === 0 ? (
              <p className="muted">No users found.</p>
            ) : (
              <div className="user-table-wrap">
                <div className="user-table">
                  <div className="user-table-head">
                    <span>User</span>
                    <span>Role</span>
                    <span>Created</span>
                    <span>Last seen</span>
                    <span>Proofs</span>
                    <span>Checkpoints</span>
                  </div>
                  {analytics.recent_users.map((userRow) => (
                    <div key={userRow.email} className="user-table-row">
                      <span className="user-email">{userRow.email}</span>
                      <span>
                        <span className="status-pill">{formatRole(userRow.role)}</span>
                      </span>
                      <span>{new Date(userRow.created_at).toLocaleDateString()}</span>
                      <span className="user-last-seen">{formatLastSeen(userRow.last_seen_at)}</span>
                      <span>{userRow.submissions_created}</span>
                      <span>{userRow.checkpoints_captured}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card stack">
            <div className="section-head">
              <div>
                <h3>Top product surfaces</h3>
                <p className="muted small">Most visited pages in the last 30 days.</p>
              </div>
            </div>

            {analytics.top_pages.length === 0 ? (
              <p className="muted">No page view data yet.</p>
            ) : (
              <div className="analytics-list">
                {analytics.top_pages.map((page) => (
                  <div key={page.path} className="analytics-row compact">
                    <div className="analytics-row-head">
                      <div>
                        <div>{humanizePath(page.path)}</div>
                        <div className="muted small">{page.path}</div>
                      </div>
                      <strong>{page.views}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card stack">
            <div className="section-head">
              <div>
                <h3>What students are writing</h3>
                <p className="muted small">Current assignment mix across created proofs.</p>
              </div>
            </div>

            {analytics.assignment_modes.length === 0 ? (
              <p className="muted">No proofs created yet.</p>
            ) : (
              <div className="analytics-list">
                {analytics.assignment_modes.map((mode) => {
                  const share = (mode.count / totalAssignmentModes) * 100;
                  return (
                    <div key={mode.mode} className="analytics-row compact">
                      <div className="analytics-row-head">
                        <span>{humanizeAssignmentMode(mode.mode)}</span>
                        <div className="analytics-row-value">
                          <strong>{mode.count}</strong>
                          <span className="analytics-rate">{formatPercent(share)}</span>
                        </div>
                      </div>
                      <div className="analytics-bar-shell">
                        <div className="analytics-bar-fill" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="section-head">
          <div>
            <h3>Latest tracked events</h3>
            <p className="muted small">
              This is a recent event feed, not a complete list of every account in the database.
            </p>
          </div>
        </div>

        {analytics.recent_events.length === 0 ? (
          <p className="muted">No tracked activity yet.</p>
        ) : (
          <div className="stack">
            {analytics.recent_events.map((event) => (
              <div key={event.id} className="timeline-item">
                <div className="timeline-meta">
                  <strong>{humanizeEventName(event.event_name)}</strong>
                  <span className="muted small">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="chip-row">
                  {event.path ? <span className="chip">{humanizePath(event.path)}</span> : null}
                  {event.user_email ? <span className="chip">{event.user_email}</span> : null}
                  {event.metadata &&
                    Object.entries(event.metadata).map(([key, value]) => (
                      <span key={key} className="chip">
                        {formatMetadataKey(key)}: {String(value)}
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
        <div className="badge">No proofs yet</div>
        <h3>Start your first proof</h3>
        <p className="muted">
          Create a proof for an essay, memo, proposal, or other writing assignment. Then return
          after real writing sessions to capture checkpoints over time.
        </p>

        <div className="toolbar">
          <a className="btn" href="/new">
            Begin a new proof
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
                {humanizeAssignmentMode(item.assignment_mode)}
                {item.course ? ` - ${item.course}` : ""}
              </div>
            </div>

            <span className="status-pill">{humanizeVisibility(item.visibility)}</span>
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
          <h2 className="page-title">{adminView ? "ProofMode operations" : "Your proofs"}</h2>
          <div className="subtitle">
            {adminView
              ? "A live view of product traction, writing activity, and proof-of-process engagement."
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
                <h3 style={{ marginBottom: 6 }}>{adminView ? "Your proofs" : "Your proof list"}</h3>
                <p className="muted small">
                  {user?.email ? `Signed in as ${user.email}` : "Signed in"}
                </p>
              </div>
              {user?.role ? <span className="status-pill">{formatRole(user.role)}</span> : null}
            </div>
          </div>

          <ProofList items={items} />
        </div>
      )}
    </main>
  );
}

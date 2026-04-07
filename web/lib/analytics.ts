"use client";

import { sendAnalyticsEvent } from "./api";

const SESSION_KEY = "proofmode_analytics_session";

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pm-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function getAnalyticsSessionId() {
  if (typeof window === "undefined") return "server";

  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const next = randomId();
  window.sessionStorage.setItem(SESSION_KEY, next);
  return next;
}

export async function trackEvent(
  eventName: string,
  payload: {
    path?: string;
    metadata?: Record<string, string | number | boolean | null>;
  } = {}
) {
  try {
    await sendAnalyticsEvent({
      event_name: eventName,
      path: payload.path ?? (typeof window !== "undefined" ? window.location.pathname : null),
      session_id: getAnalyticsSessionId(),
      metadata: payload.metadata ?? {},
    });
  } catch {
    // Analytics should never block the user flow.
  }
}

export function trackPageView(path: string) {
  return trackEvent(`page_view:${path}`, { path });
}

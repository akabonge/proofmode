export const API =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "https://api.proofmode.co";

export const API_BASE = API;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(
    new RegExp("(^|;\\s*)" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
  );

  return match ? decodeURIComponent(match[2]) : null;
}

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${API}/v1/auth/csrf`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch CSRF token (${res.status})`);
  }

  const data = await res.json().catch(() => ({}));

  const tokenFromBody =
    data?.csrf_token ??
    data?.csrf ??
    data?.token ??
    null;

  const tokenFromCookie = getCookie("pm_csrf");
  const token = tokenFromBody || tokenFromCookie;

  if (!token) {
    throw new Error("CSRF token missing from both response and cookie");
  }

  return token;
}

async function apiRequest<T = unknown>(
  path: string,
  init: RequestInit = {},
  requireCsrf: boolean = false
): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");

  const method = (init.method || "GET").toUpperCase();
  const isJsonBody =
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type");

  if (isJsonBody) {
    headers.set("Content-Type", "application/json");
  }

  if (requireCsrf && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const csrfToken = await fetchCsrfToken();
    headers.set("X-CSRF-Token", csrfToken);
  }

  const res = await fetch(`${API}${path}`, {
    ...init,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;

    try {
      const err = await res.json();
      if (err?.detail) detail = err.detail;
    } catch {
      // ignore JSON parse failures
    }

    throw new Error(detail);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function registerUser(email: string, password: string) {
  return apiRequest(
    "/v1/auth/register",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    true
  );
}

export async function loginUser(email: string, password: string) {
  return apiRequest(
    "/v1/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    true
  );
}

export async function logoutUser() {
  return apiRequest(
    "/v1/auth/logout",
    {
      method: "POST",
    },
    true
  );
}

export async function getSession() {
  return apiRequest(
    "/v1/auth/me",
    {
      method: "GET",
    },
    false
  );
}

export async function createSubmission(payload: Record<string, JsonValue>) {
  return apiRequest(
    "/v1/submissions",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    true
  );
}

export async function updateSubmission(id: string, payload: Record<string, JsonValue>) {
  return apiRequest(
    `/v1/submissions/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    true
  );
}

export async function addCheckpoint(id: string, payload: Record<string, JsonValue>) {
  return apiRequest(
    `/v1/submissions/${id}/checkpoints`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    true
  );
}

export async function requestGuidance(id: string, payload: Record<string, JsonValue>) {
  return apiRequest(
    `/v1/submissions/${id}/guidance`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    true
  );
}

export async function createShareLink(id: string) {
  return apiRequest(
    `/v1/submissions/${id}/share`,
    {
      method: "POST",
    },
    true
  );
}
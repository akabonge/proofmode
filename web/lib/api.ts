export const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="))
    ?.split("=")[1] || "";
}

export async function seedCsrf() {
  await fetch(`${API}/v1/auth/csrf`, {
    credentials: "include",
  });
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");

  const csrf = getCookie("pm_csrf");
  if (csrf && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", csrf);
  }

  return fetch(`${API}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
}
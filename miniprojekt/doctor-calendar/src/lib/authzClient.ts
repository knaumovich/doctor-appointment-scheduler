import { auth } from "../firebaseConfig";
import type { DoctorComment, UserProfile } from "./types";

const DEFAULT_BASE_URL = "/api";

function getBaseUrl() {
  return import.meta.env.VITE_AUTH_SERVER_URL || DEFAULT_BASE_URL;
}

function buildUrl(path: string) {
  const base = getBaseUrl();
  if (base.startsWith("http")) return `${base}${path}`;
  return `${base}${path}`;
}

export async function authFetch<T>(path: string, init?: RequestInit) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;
  const headers = new Headers(init?.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(buildUrl(path), {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json?.error) message = json.error;
    } catch {
      // ignore json parse
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export async function fetchMyProfile() {
  return authFetch<UserProfile>("/auth/me");
}

export async function bootstrapMyProfile() {
  return authFetch<UserProfile>("/auth/bootstrap", { method: "POST" });
}

export async function adminListUsers() {
  return authFetch<UserProfile[]>("/admin/users");
}

export async function adminRegisterDoctor(input: {
  email: string;
  password: string;
  displayName?: string;
  doctorId?: string;
}) {
  return authFetch<{ uid: string }>("/admin/register-doctor", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function adminSetBan(input: { uid: string; banned: boolean }) {
  return authFetch<{ uid: string; banned: boolean }>("/admin/ban-user", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchDoctorComments(doctorId: string) {
  return authFetch<DoctorComment[]>(`/comments/${doctorId}`);
}

export async function createDoctorComment(doctorId: string, input: { rating: number; text: string }) {
  return authFetch<DoctorComment>(`/comments/${doctorId}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function replyToComment(
  doctorId: string,
  commentId: string,
  input: { text: string }
) {
  return authFetch<DoctorComment>(`/comments/${doctorId}/${commentId}/reply`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteComment(doctorId: string, commentId: string) {
  return authFetch<{ id: string }>(`/comments/${doctorId}/${commentId}`, {
    method: "DELETE",
  });
}

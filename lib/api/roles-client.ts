/** Rol va admin boshqaruvi uchun REST yordamchilari. */
import { useEffect, useState } from "react";
import type { AdminUser, UserRole, Viewer } from "@/shared/contract";
import { API_PREFIX } from "./config";

type Envelope<T> = { data?: T; error?: { message?: string } };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || body.data === undefined) {
    throw new Error(body.error?.message ?? "So'rov bajarilmadi.");
  }
  return body.data;
}

export function fetchViewer(): Promise<Viewer> {
  return call<Viewer>("/auth/session");
}

export function fetchAdminUsers(q = ""): Promise<AdminUser[]> {
  const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return call<AdminUser[]>(`/admin/users${query}`);
}

export function updateUserRole(userId: string, role: UserRole): Promise<AdminUser> {
  return call<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

/** Joriy foydalanuvchi va uning roli. Yuklanguncha `null`. */
export function useViewer(): Viewer | null {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  useEffect(() => {
    let alive = true;
    fetchViewer().then((v) => alive && setViewer(v)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return viewer;
}

import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

/** Platforma tasdiqlagan email admin ro'yxatida (ADMIN_EMAILS yoki `admins` jadvali) bo'lsa true. */
export async function isAdminEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const listed = (env.ADMIN_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase());
  if (listed.includes(normalized)) return true;
  if (!env.DB) return false;
  const row = await env.DB.prepare("SELECT 1 AS ok FROM admins WHERE email=?").bind(normalized).first();
  return row !== null;
}

export type AdminCheck =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403; error: string };

export async function checkAdmin(): Promise<AdminCheck> {
  const user = await getChatGPTUser();
  if (!user) return { ok: false, status: 401, error: "Avval tizimga kiring." };
  if (!(await isAdminEmail(user.email))) return { ok: false, status: 403, error: "Sizda admin huquqi yo'q." };
  return { ok: true, email: user.email };
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export const jsonError = (error: string, status = 400) => Response.json({ error }, { status, headers: NO_STORE });

/**
 * Admin API so'rovlari uchun umumiy himoya: o'zgartiruvchi so'rovlarda boshqa domendan kelganini rad etadi,
 * admin huquqini va D1 mavjudligini tekshiradi. Ruxsat bo'lsa D1 ni, aks holda tayyor xato javobini qaytaradi.
 */
export async function adminGuard(request: Request, mutating: boolean): Promise<{ db: D1Database } | { denied: Response }> {
  if (mutating) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return { denied: jsonError("So'rov rad etildi.", 403) };
  }
  const admin = await checkAdmin();
  if (!admin.ok) return { denied: jsonError(admin.error, admin.status) };
  if (!env.DB) return { denied: jsonError("Ma'lumotlar bazasi mavjud emas.", 503) };
  return { db: env.DB };
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw: unknown = await request.json();
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

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

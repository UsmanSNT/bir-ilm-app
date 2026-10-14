import { env } from "cloudflare:workers";
import { chatGPTUserFromHeaders } from "@/app/chatgpt-auth";

export type Member = { id: string; name: string };

// visitor: anonymous. signed_in: platform-verified identity but not registered yet. member: registered.
export type Session =
  | { kind: "visitor" }
  | { kind: "signed_in"; authId: string; email: string; displayName: string; admin: boolean }
  | { kind: "member"; authId: string; email: string; displayName: string; admin: boolean; member: Member };

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");

export async function sha256(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

// The platform ID is never exposed to other readers; members are addressed by its hash.
export const memberIdFor = async (authId: string) => "member_" + await sha256(authId);

function isAdminEmail(email: string) {
  return (env.ADMIN_EMAILS ?? "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

export async function getSession(requestHeaders: { get(name: string): string | null }): Promise<Session> {
  const user = chatGPTUserFromHeaders(requestHeaders);
  if (!user) return { kind: "visitor" };
  const admin = isAdminEmail(user.email);
  const base = { authId: user.userId, email: user.email, displayName: user.displayName, admin };
  const db = env.DB;
  if (!db) return { kind: "signed_in", ...base };
  const row = await db.prepare("SELECT id, name FROM users WHERE auth_id=? AND registered_at IS NOT NULL").bind(user.userId).first<Member>();
  return row ? { kind: "member", ...base, member: row } : { kind: "signed_in", ...base };
}

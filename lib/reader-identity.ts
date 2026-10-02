import { env } from "cloudflare:workers";

const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const sha256 = async (value: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const cookie = (request: Request, name: string) => request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]{64})(?:;|$)`))?.[1];
const secure = (request: Request) => (new URL(request.url).protocol === "https:" ? "; Secure" : "");

export const SESSION_DAYS = 30;
export const sessionCookie = (request: Request, token: string) => `bir_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure(request)}`;
export const clearSessionCookie = (request: Request) => `bir_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure(request)}`;

export type Identity = { id: string; headers: Headers; authed: boolean; login: string | null };

/**
 * Foydalanuvchini aniqlaydi. Avval `bir_session` (hisobga kirgan), bo'lmasa mehmon cookie'si.
 * Mehmon uchun tasodifiy HttpOnly token: mijoz yuborgan user ID qabul qilinmaydi.
 */
export async function readerIdentity(request: Request): Promise<Identity> {
  const headers = new Headers({ "Cache-Control": "no-store" });
  const session = cookie(request, "bir_session");
  if (session && env.DB) {
    const row = await env.DB.prepare("SELECT s.user_id AS userId, a.login FROM sessions s JOIN accounts a ON a.user_id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now')")
      .bind(await sha256(session)).first<{ userId: string; login: string }>().catch(() => null);
    if (row) return { id: row.userId, headers, authed: true, login: row.login };
  }
  const existing = cookie(request, "bir_reader");
  const token = existing ?? randomToken();
  if (!existing) headers.append("Set-Cookie", `bir_reader=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure(request)}`);
  return { id: "reader_" + await sha256(token), headers, authed: false, login: null };
}

export const authRequired = (headers: Headers) => Response.json({ error: "Avval hisobingizga kiring.", auth: true }, { status: 401, headers });

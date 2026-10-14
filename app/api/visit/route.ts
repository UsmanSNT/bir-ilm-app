import { env } from "cloudflare:workers";
import { getSession, sha256 } from "@/app/server/session";

export const runtime = "edge";

const COOKIE = "bir_visitor";
const RETENTION_DAYS = 90;
const BOT = /bot|crawl|spider|slurp|curl|wget|headless|preview|monitor/i;

function device(ua: string) {
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

// Counts an anonymous page visit in `site_visitors`. Creates no user, profile or social rights.
export async function POST(request: Request) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403, headers });
  const ua = (request.headers.get("user-agent") ?? "").slice(0, 300);
  if (!ua || BOT.test(ua)) return new Response(null, { status: 204, headers });
  try {
    const db = env.DB;
    if (!db) return new Response(null, { status: 204, headers });
    // Registered members are listed separately and are not counted as anonymous visitors.
    if ((await getSession(request.headers)).kind === "member") return new Response(null, { status: 204, headers });
    const existing = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})(?:;|$)`))?.[1];
    const token = existing ?? Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
    if (!existing) headers.append("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
    const country = /^[A-Z]{2}$/.test(request.headers.get("cf-ipcountry") ?? "") ? request.headers.get("cf-ipcountry") : null;
    // A return after 30 idle minutes counts as a new visit; reloads inside that window do not.
    await db.prepare(
      `INSERT INTO site_visitors (id, country, device) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         visits = visits + (last_seen < datetime('now', '-30 minutes')),
         last_seen = CURRENT_TIMESTAMP,
         country = COALESCE(excluded.country, country),
         device = excluded.device`,
    ).bind("v_" + await sha256(token), country, device(ua)).run();
    if (!existing && Math.random() < 0.05) {
      await db.prepare(`DELETE FROM site_visitors WHERE last_seen < datetime('now', '-${RETENTION_DAYS} days')`).run();
    }
    return new Response(null, { status: 204, headers });
  } catch { return new Response(null, { status: 204, headers }); }
}

import { env } from "cloudflare:workers";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import { getSession, memberIdFor } from "@/app/server/session";

export const runtime = "edge";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const session = await getSession(request.headers);
    return Response.json({
      kind: session.kind,
      name: session.kind === "member" ? session.member.name : null,
      suggestedName: session.kind === "signed_in" ? session.displayName : null,
      admin: session.kind !== "visitor" && session.admin,
      signInPath: chatGPTSignInPath("/"),
    }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Holat yuklanmadi." }, { status: 503, headers: NO_STORE });
  }
}

// Explicit registration: turns a platform-verified sign-in into a member who may chat and post.
export async function POST(request: Request) {
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers: NO_STORE });
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("So'rov rad etildi.", 403);
  let name = "";
  try {
    const raw = await request.json() as { name?: unknown };
    if (typeof raw?.name === "string") name = raw.name.trim().replace(/\s+/g, " ").slice(0, 40);
  } catch { return fail("So'rov noto'g'ri.", 400); }
  if (name.length < 2) return fail("Ismingizni kiriting (kamida 2 belgi).", 400);
  try {
    const db = env.DB;
    if (!db) return fail("Ma'lumotlar bazasi ulanmagan.", 503);
    const session = await getSession(request.headers);
    if (session.kind === "visitor") return fail("Avval tizimga kiring.", 401);
    if (session.kind === "member") return Response.json({ kind: "member", name: session.member.name }, { headers: NO_STORE });
    const id = await memberIdFor(session.authId);
    await db.prepare(
      "INSERT INTO users (id, name, auth_id, registered_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET name=excluded.name, auth_id=excluded.auth_id, registered_at=COALESCE(users.registered_at, CURRENT_TIMESTAMP)",
    ).bind(id, name, session.authId).run();
    return Response.json({ kind: "member", name }, { status: 201, headers: NO_STORE });
  } catch { return fail("Ro'yxatdan o'tish saqlanmadi. Qayta urinib ko'ring.", 503); }
}

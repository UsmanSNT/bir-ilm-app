/** Chiqish: login sessiyasini o'chiradi va cookie'ni tozalaydi (keyingi kirishda yangi mehmon bo'ladi). */
import { clearSessionCookie, readToken } from "@/server/auth/identity";
import { deleteSession } from "@/server/auth/sessions";
import { isAllowedOrigin, parseAllowedOrigins } from "@/server/http/cors";
import { tryGetDb } from "@/server/db/client";

export async function POST(request: Request) {
  const allowed = isAllowedOrigin({
    origin: request.headers.get("origin"),
    selfOrigin: new URL(request.url).origin,
    allowed: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  });
  if (!allowed) return Response.json({ ok: false }, { status: 403 });

  const token = readToken(request);
  const db = await tryGetDb();
  if (token && db) await deleteSession(db, token);

  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearSessionCookie(request));
  return Response.json({ ok: true }, { headers });
}

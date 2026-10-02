import { env } from "cloudflare:workers";
import { readerIdentity } from "@/lib/reader-identity";
import { backToApp, sameHash, signInWithProvider } from "@/lib/auth-session";

export const runtime = "edge";

type GoogleClaims = { iss?: string; aud?: string; sub?: string; exp?: number; email?: string; email_verified?: boolean; name?: string; given_name?: string };

function decodeJwtPayload(jwt: string): GoogleClaims | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(json, c => c.charCodeAt(0)))) as GoogleClaims;
  } catch { return null; }
}

/** Google qaytargan kodni tokenga almashtirib, foydalanuvchini kiritadi. */
export async function GET(request: Request) {
  const fail = (reason: string) => {
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", "bir_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0");
    return backToApp(request, headers, reason);
  };
  const db = env.DB;
  if (!db || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return fail("google_off");

  const params = new URL(request.url).searchParams;
  if (params.get("error")) return fail("cancelled");
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";
  const saved = request.headers.get("cookie")?.match(/(?:^|;\s*)bir_oauth=([a-f0-9]{64})\.([a-f0-9]{128})(?:;|$)/);
  // CSRF himoyasi: state brauzer cookie'sidagi bilan bir xil bo'lishi shart.
  if (!code || !saved || !sameHash(state, saved[1])) return fail("error");

  let claims: GoogleClaims | null = null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code_verifier: saved[2],
        redirect_uri: new URL("/api/auth/google/callback", request.url).toString(), grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return fail("error");
    const token = (await res.json()) as { id_token?: string };
    // ID token to'g'ridan-to'g'ri Google token endpointidan TLS orqali olindi (OIDC Core 3.1.3.7):
    // imzo o'rniga issuer/audience/muddat tekshiriladi.
    claims = token.id_token ? decodeJwtPayload(token.id_token) : null;
  } catch { return fail("error"); }

  if (!claims?.sub || !["https://accounts.google.com", "accounts.google.com"].includes(claims.iss ?? "") || claims.aud !== env.GOOGLE_CLIENT_ID || !claims.exp || claims.exp * 1000 < Date.now()) return fail("error");
  if (claims.email && claims.email_verified === false) return fail("unverified");

  try {
    const identity = await readerIdentity(request);
    const headers = await signInWithProvider(db, request, identity, {
      provider: "google", subject: claims.sub, email: claims.email ?? null,
      name: claims.name || claims.given_name || claims.email?.split("@")[0] || "Kitobxon",
    });
    for (const c of identity.headers.getSetCookie()) headers.append("Set-Cookie", c);
    headers.append("Set-Cookie", "bir_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0");
    return backToApp(request, headers, "google");
  } catch { return fail("error"); }
}

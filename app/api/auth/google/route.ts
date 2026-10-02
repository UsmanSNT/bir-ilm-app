import { env } from "cloudflare:workers";
import { randomToken } from "@/lib/reader-identity";
import { backToApp } from "@/lib/auth-session";

export const runtime = "edge";

const b64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Google bilan kirishni boshlash: state + PKCE, so'ng Google sahifasiga yo'naltirish. */
export async function GET(request: Request) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return backToApp(request, headers, "google_off");
  const state = randomToken();
  const verifier = randomToken() + randomToken();
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  headers.append("Set-Cookie", `bir_oauth=${state}.${verifier}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600${secure}`);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: new URL("/api/auth/google/callback", request.url).toString(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  headers.set("Location", url.toString());
  return new Response(null, { status: 302, headers });
}

/**
 * "Google bilan kirish" — foydalanuvchini Google'ning kirish sahifasiga yuboradi.
 * `?flow=` — ilovadan boshlangan kirish (telefon brauzerida ochiladi).
 */
import { generateToken } from "@/server/auth/identity";
import { authPage, backToApp, beginFlow, stateCookie } from "@/server/auth/login-flow";
import { googleAuthUrl, loginConfig } from "@/server/auth/providers";

export async function GET(request: Request) {
  const config = loginConfig(request);
  if (!config.google) return backToApp(request, "error", "Google orqali kirish hali sozlanmagan.");

  const headers = new Headers({ "Cache-Control": "no-store" });
  const flowError = await beginFlow(request, headers);
  if (flowError) return authPage("Kirib bo'lmadi", `<p>${flowError}</p>`);

  const state = generateToken();
  const redirectUri = `${config.publicUrl}/api/auth/google/callback`;
  headers.set("Location", googleAuthUrl(config.google.clientId, redirectUri, state));
  headers.append("Set-Cookie", stateCookie(request, state));
  return new Response(null, { status: 302, headers });
}

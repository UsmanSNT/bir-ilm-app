/** "Google bilan kirish" — foydalanuvchini Google'ning kirish sahifasiga yuboradi. */
import { generateToken } from "@/server/auth/identity";
import { backToApp, stateCookie } from "@/server/auth/login-flow";
import { googleAuthUrl, loginConfig } from "@/server/auth/providers";

export async function GET(request: Request) {
  const config = loginConfig(request);
  if (!config.google) return backToApp(request, "error", "Google orqali kirish hali sozlanmagan.");

  const state = generateToken();
  const redirectUri = `${config.publicUrl}/api/auth/google/callback`;
  const headers = new Headers({ Location: googleAuthUrl(config.google.clientId, redirectUri, state) });
  headers.append("Set-Cookie", stateCookie(request, state));
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status: 302, headers });
}

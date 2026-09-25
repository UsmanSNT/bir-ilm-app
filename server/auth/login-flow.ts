/** Google/Telegram qaytgandan keyingi umumiy qadam: akkaunt, sessiya, cookie, qaytish. */
import { tryGetDb } from "@/server/db/client";
import { signInWithProvider } from "@/server/services/accounts";
import { resolveIdentity, sessionCookie } from "./identity";
import { loginConfig, LoginError, type ProviderProfile } from "./providers";
import { createSession, deleteSession } from "./sessions";

export const OAUTH_STATE_COOKIE = "bir_oauth_state";

export function stateCookie(request: Request, value: string, maxAge = 600): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${OAUTH_STATE_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=${maxAge}${secure}`;
}

export function readCookie(request: Request, name: string): string | null {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get("cookie") ?? "");
  return match ? match[1] : null;
}

export function backToApp(request: Request, result: "ok" | "error", message?: string, headers = new Headers()): Response {
  const url = new URL("/", loginConfig(request).publicUrl);
  url.searchParams.set("login", result);
  if (message) url.searchParams.set("message", message.slice(0, 160));
  headers.set("Location", url.toString());
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status: 302, headers });
}

export async function finishLogin(request: Request, loadProfile: () => Promise<ProviderProfile>): Promise<Response> {
  const headers = new Headers();
  headers.append("Set-Cookie", stateCookie(request, "", 0));
  try {
    const profile = await loadProfile();
    const db = await tryGetDb();
    if (!db) throw new LoginError("Ma'lumotlar bazasi ulanmagan.");

    const current = await resolveIdentity(request);
    const userId = await signInWithProvider(db, current.userId, profile);
    const token = await createSession(db, userId);
    // Oldingi token login sessiyasi bo'lgan bo'lsa, u endi kerak emas.
    if (!current.isNew) await deleteSession(db, current.token);

    headers.append("Set-Cookie", sessionCookie(request, token));
    return backToApp(request, "ok", undefined, headers);
  } catch (error) {
    const message = error instanceof LoginError ? error.message : "Kirishda kutilmagan xato.";
    if (!(error instanceof LoginError)) console.error("[auth] login failed:", error);
    return backToApp(request, "error", message, headers);
  }
}

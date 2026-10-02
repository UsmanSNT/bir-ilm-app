/** Google/Telegram qaytgandan keyingi umumiy qadam: akkaunt, sessiya, cookie, qaytish. */
import { tryGetDb, type Database } from "@/server/db/client";
import { signInWithProvider } from "@/server/services/accounts";
import { resolveIdentity, sessionCookie } from "./identity";
import { createHandoff, peekAppFlow, takeAppFlow } from "./link-codes";
import { loginConfig, LoginError, type ProviderProfile } from "./providers";
import { createSession, deleteSession } from "./sessions";

export const OAUTH_STATE_COOKIE = "bir_oauth_state";
/** Ilovadan boshlangan kirish: brauzer kirishni tugatgach ilovaga qaytaradi. */
export const APP_FLOW_COOKIE = "bir_app_flow";
/** Android intent-filter va iOS CFBundleURLSchemes'dagi sxema. */
export const APP_RETURN_URL = "uz.birilm.app://auth";

function authCookie(request: Request, name: string, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=${maxAge}${secure}`;
}

export function stateCookie(request: Request, value: string, maxAge = 600): string {
  return authCookie(request, OAUTH_STATE_COOKIE, value, maxAge);
}

export function appFlowCookie(request: Request, flow: string, maxAge = 600): string {
  return authCookie(request, APP_FLOW_COOKIE, flow, maxAge);
}

export function readCookie(request: Request, name: string): string | null {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get("cookie") ?? "");
  return match ? match[1] : null;
}

/**
 * Kirishni boshlash: `?flow=` bo'lsa (ilovadan) oqimni cookie'ga yozadi, bo'lmasa
 * eskisini o'chiradi — aks holda keyingi oddiy web kirish ilovaga qaytib ketardi.
 * Oqim yaroqsiz bo'lsa xato matnini qaytaradi.
 */
export async function beginFlow(request: Request, headers: Headers): Promise<string | null> {
  const flow = new URL(request.url).searchParams.get("flow");
  if (!flow) {
    if (readCookie(request, APP_FLOW_COOKIE)) headers.append("Set-Cookie", appFlowCookie(request, "", 0));
    return null;
  }
  const db = await tryGetDb();
  if (!db || !(await peekAppFlow(db, flow))) return "Kirish havolasi eskirgan. Ilovaga qaytib, qayta bosing.";
  headers.append("Set-Cookie", appFlowCookie(request, flow));
  return null;
}

export function backToApp(request: Request, result: "ok" | "error", message?: string, headers = new Headers()): Response {
  const url = new URL("/", loginConfig(request).publicUrl);
  url.searchParams.set("login", result);
  if (message) url.searchParams.set("message", message.slice(0, 160));
  headers.set("Location", url.toString());
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status: 302, headers });
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Kichik HTML sahifa (brauzerda ko'rinadi): ilovadan kirish sahifalari va ilovaga qaytish. */
export function authPage(title: string, body: string, headers = new Headers(), script = ""): Response {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  const html = `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7f5;font:16px/1.5 system-ui,sans-serif;color:#17332d}main{max-width:340px;padding:28px 22px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 18px;color:#4d615c}.btn{display:inline-block;background:#0f4f45;color:#fff;border-radius:12px;padding:12px 20px;text-decoration:none;font-weight:600}</style>
</head><body><main><h1>${escapeHtml(title)}</h1>${body}</main>${script}</body></html>`;
  return new Response(html, { status: 200, headers });
}

/** Brauzerdan ilovaga qaytish sahifasi: avtomatik ochadi, bo'lmasa tugma bor. */
function returnToApp(params: Record<string, string>, headers: Headers): Response {
  const target = `${APP_RETURN_URL}?${new URLSearchParams(params)}`;
  const ok = !params.error;
  return authPage(
    ok ? "Kirildi — ilovaga qayting" : "Kirib bo'lmadi",
    `<p>${escapeHtml(ok ? "Bir Ilm ilovasi ochilmasa, tugmani bosing." : params.error)}</p><a class="btn" href="${escapeHtml(target)}">Ilovaga qaytish</a>`,
    headers,
    `<script>location.replace(${JSON.stringify(target)})</script>`,
  );
}

export async function finishLogin(request: Request, loadProfile: () => Promise<ProviderProfile>): Promise<Response> {
  const headers = new Headers();
  headers.append("Set-Cookie", stateCookie(request, "", 0));
  const flow = readCookie(request, APP_FLOW_COOKIE);
  if (flow) headers.append("Set-Cookie", appFlowCookie(request, "", 0));

  try {
    const profile = await loadProfile();
    const db = await tryGetDb();
    if (!db) throw new LoginError("Ma'lumotlar bazasi ulanmagan.");
    if (flow) return await finishAppLogin(db, flow, profile, headers);

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
    return flow ? returnToApp({ error: message }, headers) : backToApp(request, "error", message, headers);
  }
}

/** Ilova oqimi: sessiya brauzerga yozilmaydi — ilova uni handoff kodi orqali oladi. */
async function finishAppLogin(db: Database, flow: string, profile: ProviderProfile, headers: Headers): Promise<Response> {
  const row = await takeAppFlow(db, flow);
  if (!row?.challenge) throw new LoginError("Kirish havolasi eskirgan. Ilovaga qaytib, qayta bosing.");
  const code = await createHandoff(db, { userId: row.userId, challenge: row.challenge }, profile);
  return returnToApp({ code }, headers);
}

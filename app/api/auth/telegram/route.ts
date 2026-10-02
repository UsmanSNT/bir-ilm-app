import { env } from "cloudflare:workers";
import { readerIdentity } from "@/lib/reader-identity";
import { backToApp, signInWithProvider } from "@/lib/auth-session";
import { verifyTelegram } from "@/lib/telegram";

export const runtime = "edge";

/** Telegram widget shu manzilga foydalanuvchi ma'lumotlari bilan yo'naltiradi (data-auth-url). */
export async function GET(request: Request) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  const db = env.DB;
  if (!db || !env.TELEGRAM_BOT_TOKEN) return backToApp(request, headers, "telegram_off");
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";
  if (!/^\d{1,20}$/.test(id) || !await verifyTelegram(params, env.TELEGRAM_BOT_TOKEN)) return backToApp(request, headers, "error");
  try {
    const identity = await readerIdentity(request);
    const name = [params.get("first_name"), params.get("last_name")].filter(Boolean).join(" ") || params.get("username") || "Kitobxon";
    const out = await signInWithProvider(db, request, identity, { provider: "telegram", subject: id, name });
    for (const c of identity.headers.getSetCookie()) out.append("Set-Cookie", c);
    return backToApp(request, out, "telegram");
  } catch { return backToApp(request, headers, "error"); }
}

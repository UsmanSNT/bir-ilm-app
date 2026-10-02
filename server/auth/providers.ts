/**
 * Google va Telegram orqali kirish.
 *
 * Sozlamalar muhit o'zgaruvchilaridan (maxfiy qiymatlar faqat serverda):
 *   PUBLIC_URL                                — https://birilm.uz
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET    — Google Cloud Console → OAuth client
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME — @BotFather (bot domeni /setdomain bilan birilm.uz)
 */
export type ProviderProfile = {
  provider: "google" | "telegram";
  subject: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
};

export class LoginError extends Error {}

export function loginConfig(request: Request) {
  const env = process.env;
  const publicUrl = (env.PUBLIC_URL?.trim() || new URL(request.url).origin).replace(/\/+$/, "");
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID.trim(), clientSecret: env.GOOGLE_CLIENT_SECRET.trim() }
    : null;
  const telegram = env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME
    ? { token: env.TELEGRAM_BOT_TOKEN.trim(), username: env.TELEGRAM_BOT_USERNAME.trim().replace(/^@/, "") }
    : null;
  return { publicUrl, google, telegram };
}

// ── Google ──────────────────────────────────────────────────────────

export function googleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1] ?? "";
  const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(json, (c) => c.charCodeAt(0))));
}

export async function googleProfile(
  config: { clientId: string; clientSecret: string },
  code: string,
  redirectUri: string,
): Promise<ProviderProfile> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !body.id_token) throw new LoginError(`Google javob bermadi (${body.error ?? res.status}).`);

  // id_token Google'dan to'g'ridan-to'g'ri HTTPS orqali olindi, shuning uchun imzoni alohida tekshirish shart emas;
  // lekin kimga va qachon berilganini tekshiramiz.
  const claims = decodeJwtPayload(body.id_token);
  const iss = String(claims.iss ?? "");
  if (claims.aud !== config.clientId) throw new LoginError("Google token boshqa ilova uchun berilgan.");
  if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") throw new LoginError("Google token manbasi noto'g'ri.");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) throw new LoginError("Google token eskirgan.");
  if (typeof claims.sub !== "string" || !claims.sub) throw new LoginError("Google foydalanuvchi ID'si yo'q.");

  const email = typeof claims.email === "string" && claims.email_verified !== false ? claims.email : null;
  return {
    provider: "google",
    subject: claims.sub,
    email,
    name: typeof claims.name === "string" && claims.name ? claims.name : email?.split("@")[0] ?? "Kitobxon",
    avatarUrl: typeof claims.picture === "string" ? claims.picture : null,
  };
}

// ── Telegram ────────────────────────────────────────────────────────

const TELEGRAM_MAX_AGE_SECONDS = 24 * 60 * 60;

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** https://core.telegram.org/widgets/login#checking-authorization */
export async function telegramProfile(botToken: string, params: URLSearchParams): Promise<ProviderProfile> {
  const hash = params.get("hash") ?? "";
  const fields = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(botToken));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(fields)));
  if (!hash || !safeEqual(expected, hash.toLowerCase())) throw new LoginError("Telegram ma'lumoti imzosi noto'g'ri.");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > TELEGRAM_MAX_AGE_SECONDS) {
    throw new LoginError("Telegram orqali kirish muddati o'tgan. Qayta urinib ko'ring.");
  }

  const id = params.get("id");
  if (!id) throw new LoginError("Telegram foydalanuvchi ID'si yo'q.");
  const name = [params.get("first_name"), params.get("last_name")].filter(Boolean).join(" ")
    || params.get("username")
    || "Kitobxon";
  return {
    provider: "telegram",
    subject: id,
    email: null,
    name,
    avatarUrl: params.get("photo_url"),
  };
}

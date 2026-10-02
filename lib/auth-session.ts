import { randomToken, sessionCookie, sha256, SESSION_DAYS, type Identity } from "./reader-identity";

/** Yangi sessiya ochadi va javobga cookie qo'shadi. */
export async function openSession(db: D1Database, request: Request, userId: string, headers: Headers) {
  const token = randomToken();
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE user_id=? AND expires_at <= datetime('now')").bind(userId),
    db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`).bind(await sha256(token), userId),
  ]);
  headers.append("Set-Cookie", sessionCookie(request, token));
}

/** Joriy foydalanuvchi ma'lumoti (hisobga kirmagan bo'lsa null). */
export async function currentUser(db: D1Database, identity: Identity) {
  if (!identity.authed) return null;
  const row = await db.prepare("SELECT u.name, (SELECT group_concat(provider) FROM oauth_identities o WHERE o.user_id=u.id) AS providers, (SELECT email FROM accounts a WHERE a.user_id=u.id) AS email FROM users u WHERE u.id=?")
    .bind(identity.id).first<{ name: string; providers: string | null; email: string | null }>();
  return { id: identity.id, login: identity.login, name: row?.name ?? "Kitobxon", email: row?.email ?? null, providers: row?.providers ? row.providers.split(",") : [] };
}

/** Yangi hisob uchun ID: mehmon hali hech qaysi hisobga bog'lanmagan bo'lsa uning ID'si (savat va h.k. saqlanadi). */
export async function newAccountUserId(db: D1Database, identity: Identity) {
  if (identity.authed) return "reader_" + await sha256(randomToken());
  const taken = await db.prepare("SELECT 1 FROM accounts WHERE user_id=? UNION SELECT 1 FROM oauth_identities WHERE user_id=?").bind(identity.id, identity.id).first();
  return taken ? "reader_" + await sha256(randomToken()) : identity.id;
}

/**
 * Tashqi provayder (Google/Telegram) orqali kirish.
 * Avval bog'langan bo'lsa o'sha foydalanuvchi; hisobga kirgan holda bo'lsa joriy hisobga bog'lanadi; aks holda yangi hisob.
 */
export async function signInWithProvider(db: D1Database, request: Request, identity: Identity, p: { provider: "google" | "telegram"; subject: string; name: string; email?: string | null }) {
  const linked = await db.prepare("SELECT user_id AS userId FROM oauth_identities WHERE provider=? AND subject=?").bind(p.provider, p.subject).first<{ userId: string }>();
  let userId = linked?.userId;
  if (!userId) {
    userId = identity.authed ? identity.id : await newAccountUserId(db, identity);
    const name = p.name.trim().replace(/\s+/g, " ").slice(0, 40) || "Kitobxon";
    await db.batch([
      identity.authed
        ? db.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)").bind(userId, name)
        : db.prepare("INSERT INTO users (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=CURRENT_TIMESTAMP").bind(userId, name),
      db.prepare("INSERT INTO oauth_identities (provider, subject, user_id, email) VALUES (?,?,?,?)").bind(p.provider, p.subject, userId, p.email ?? null),
    ]);
  }
  const headers = new Headers({ "Cache-Control": "no-store" });
  await openSession(db, request, userId, headers);
  return headers;
}

/** OAuth oxirida ilovaga qaytarish (natija `?auth=` parametrida). */
export function backToApp(request: Request, headers: Headers, result: string) {
  headers.set("Location", new URL(`/?auth=${encodeURIComponent(result)}`, request.url).toString());
  return new Response(null, { status: 302, headers });
}

/** Vaqt bo'yicha teng solishtirish (xesh va imzolar uchun). */
export function sameHash(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

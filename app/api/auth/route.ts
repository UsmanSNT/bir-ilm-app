import { env } from "cloudflare:workers";
import { clearSessionCookie, randomToken, readerIdentity, sha256 } from "@/lib/reader-identity";
import { currentUser, newAccountUserId, openSession, sameHash } from "@/lib/auth-session";

export const runtime = "edge";

// Cloudflare Workers PBKDF2 uchun 100 000 iteratsiyadan ko'pini qo'llamaydi.
const ITERATIONS = 100_000;
const LOGIN_RE = /^[a-z0-9_.]{3,32}$/;
const MAX_FAILS = 10;

async function hashPassword(password: string, saltHex: string, iterations: number) {
  const salt = new Uint8Array(saltHex.match(/../g)!.map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const identity = await readerIdentity(request);
  // Qaysi tashqi kirish usullari sozlangan: tugmalar faqat shularda ko'rsatiladi.
  const providers = { google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), telegram: env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME ? env.TELEGRAM_BOT_USERNAME : null };
  if (!env.DB) return Response.json({ user: null, providers }, { headers: identity.headers });
  return Response.json({ user: await currentUser(env.DB, identity), providers }, { headers: identity.headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "So'rov rad etildi." }, { status: 403 });
  const identity = await readerIdentity(request);
  const { headers } = identity;
  const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });
  const db = env.DB;
  if (!db) return fail("Server hozir mavjud emas.", 503);

  let p: Record<string, unknown>;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error();
    p = raw as Record<string, unknown>;
  } catch { return fail("So'rov noto'g'ri."); }

  try {
    if (p.type === "logout") {
      const token = request.headers.get("cookie")?.match(/(?:^|;\s*)bir_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      if (token) await db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
      headers.append("Set-Cookie", clearSessionCookie(request));
      return Response.json({ ok: true }, { headers });
    }

    const login = typeof p.login === "string" ? p.login.trim().toLowerCase() : "";
    const password = typeof p.password === "string" ? p.password : "";
    if (!LOGIN_RE.test(login)) return fail("Login 3–32 belgi: lotin harflari, raqam, _ yoki .");
    if (password.length < 8 || password.length > 128) return fail("Parol kamida 8 belgidan iborat bo'lsin.");

    if (p.type === "register") {
      const name = typeof p.name === "string" ? p.name.trim().replace(/\s+/g, " ").slice(0, 40) : "";
      if (name.length < 2) return fail("Ismingizni kiriting.");
      if (await db.prepare("SELECT 1 FROM accounts WHERE login=?").bind(login).first()) return fail("Bu login band. Boshqasini tanlang.", 409);
      // Mehmon sifatida qilingan ishlar (savat va h.k.) yangi hisobga o'tadi; u mehmon allaqachon hisobga bog'langan bo'lsa yangi ID.
      const userId = await newAccountUserId(db, identity);
      const salt = randomToken().slice(0, 32);
      const hash = await hashPassword(password, salt, ITERATIONS);
      await db.batch([
        db.prepare("INSERT INTO users (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=CURRENT_TIMESTAMP").bind(userId, name),
        db.prepare("INSERT INTO accounts (user_id, login, password_hash, salt, iterations) VALUES (?,?,?,?,?)").bind(userId, login, hash, salt, ITERATIONS),
      ]);
      await openSession(db, request, userId, headers);
      return Response.json({ user: { id: userId, login, name, providers: [] } }, { headers });
    }

    if (p.type === "login") {
      const fails = await db.prepare("SELECT count(*) AS n FROM auth_attempts WHERE login=? AND created_at > datetime('now','-15 minutes')").bind(login).first<{ n: number }>();
      if ((fails?.n ?? 0) >= MAX_FAILS) return fail("Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring.", 429);
      const account = await db.prepare("SELECT user_id AS userId, password_hash AS hash, salt, iterations FROM accounts WHERE login=?").bind(login).first<{ userId: string; hash: string; salt: string; iterations: number }>();
      // Login mavjud bo'lmasa ham xeshlash bajariladi: javob vaqti orqali loginlarni aniqlab bo'lmasin.
      const computed = await hashPassword(password, account?.salt ?? "00".repeat(16), account?.iterations ?? ITERATIONS);
      if (!account || !sameHash(computed, account.hash)) {
        await db.prepare("INSERT INTO auth_attempts (login) VALUES (?)").bind(login).run();
        return fail("Login yoki parol noto'g'ri.", 401);
      }
      await db.prepare("DELETE FROM auth_attempts WHERE login=?").bind(login).run();
      await openSession(db, request, account.userId, headers);
      return Response.json({ user: await currentUser(db, { id: account.userId, headers, authed: true, login }) }, { headers });
    }
    return fail("Noma'lum amal.");
  } catch {
    return fail("Xatolik. Qayta urinib ko'ring.", 503);
  }
}

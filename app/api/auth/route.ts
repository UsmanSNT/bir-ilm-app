import { env } from "cloudflare:workers";
import { clearSessionCookie, randomToken, readerIdentity, sha256 } from "@/lib/reader-identity";
import { currentUser, newAccountUserId, openSession, sameHash } from "@/lib/auth-session";
import { canEmail, canTelegram, sendEmail, sendTelegram } from "@/lib/notify";

export const runtime = "edge";

// Cloudflare Workers PBKDF2 uchun 100 000 iteratsiyadan ko'pini qo'llamaydi.
const ITERATIONS = 100_000;
const LOGIN_RE = /^[a-z0-9_.]{3,32}$/;
const MAX_FAILS = 10;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const RESET_MINUTES = 30;
const MAX_RESET_REQUESTS = 3;

const passwordProblem = (password: string) => (password.length < 8 || password.length > 128 ? "Parol kamida 8 belgidan iborat bo'lsin." : "");
const cleanEmail = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

async function newPasswordFields(password: string) {
  const salt = randomToken().slice(0, 32);
  return { salt, hash: await hashPassword(password, salt, ITERATIONS) };
}

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

    // Parolni unutdim: javob har doim bir xil (hisob bor-yo'qligini bilib bo'lmasin).
    if (p.type === "forgot") {
      const ident = typeof p.identifier === "string" ? p.identifier.trim().toLowerCase().slice(0, 254) : "";
      const generic = Response.json({ ok: true, message: "Agar hisob topilsa va unga email yoki Telegram bog'langan bo'lsa, tiklash havolasi yuborildi." }, { headers });
      if (!ident) return fail("Login yoki emailni kiriting.");
      const key = `forgot:${ident}`;
      const recent = await db.prepare("SELECT count(*) AS n FROM auth_attempts WHERE login=? AND created_at > datetime('now','-15 minutes')").bind(key).first<{ n: number }>();
      if ((recent?.n ?? 0) >= MAX_RESET_REQUESTS) return fail("Juda ko'p so'rov. 15 daqiqadan keyin qayta urinib ko'ring.", 429);
      await db.prepare("INSERT INTO auth_attempts (login) VALUES (?)").bind(key).run();
      const acc = await db.prepare("SELECT a.user_id AS userId, a.login, a.email, (SELECT subject FROM oauth_identities o WHERE o.user_id=a.user_id AND o.provider='telegram') AS telegram FROM accounts a WHERE a.login=? OR a.email=?")
        .bind(ident, ident).first<{ userId: string; login: string; email: string | null; telegram: string | null }>();
      const viaEmail = !!(acc?.email && canEmail());
      const viaTelegram = !!(acc?.telegram && canTelegram());
      if (!acc || (!viaEmail && !viaTelegram)) return generic;
      const token = randomToken();
      await db.batch([
        db.prepare("DELETE FROM password_resets WHERE user_id=? AND used_at IS NULL").bind(acc.userId),
        db.prepare(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+${RESET_MINUTES} minutes'))`).bind(await sha256(token), acc.userId),
      ]);
      const link = new URL(`/?reset=${token}`, request.url).toString();
      const text = `Bir Ilm: @${acc.login} hisobi parolini tiklash uchun havola (${RESET_MINUTES} daqiqa amal qiladi):\n${link}\n\nAgar bu siz bo'lmasangiz, xabarni e'tiborsiz qoldiring.`;
      if (viaEmail) await sendEmail(acc.email!, "Bir Ilm — parolni tiklash", text, `<p>Assalomu alaykum!</p><p><b>@${acc.login}</b> hisobi parolini tiklash uchun quyidagi havolani bosing (${RESET_MINUTES} daqiqa amal qiladi):</p><p><a href="${link}">Parolni tiklash</a></p><p>Agar bu siz bo'lmasangiz, xatni e'tiborsiz qoldiring.</p>`);
      if (viaTelegram) await sendTelegram(acc.telegram!, text);
      return generic;
    }

    // Havola orqali yangi parol o'rnatish: token bir martalik, barcha eski sessiyalar yopiladi.
    if (p.type === "reset") {
      const token = typeof p.token === "string" && /^[a-f0-9]{64}$/.test(p.token) ? p.token : "";
      const password = typeof p.password === "string" ? p.password : "";
      const problem = passwordProblem(password);
      if (problem) return fail(problem);
      const row = token ? await db.prepare("SELECT r.user_id AS userId, a.login FROM password_resets r JOIN accounts a ON a.user_id=r.user_id WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at > datetime('now')").bind(await sha256(token)).first<{ userId: string; login: string }>() : null;
      if (!row) return fail("Havola eskirgan yoki allaqachon ishlatilgan. Qaytadan so'rang.", 410);
      const { salt, hash } = await newPasswordFields(password);
      await db.batch([
        db.prepare("UPDATE accounts SET password_hash=?, salt=?, iterations=? WHERE user_id=?").bind(hash, salt, ITERATIONS, row.userId),
        db.prepare("UPDATE password_resets SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL").bind(row.userId),
        db.prepare("DELETE FROM sessions WHERE user_id=?").bind(row.userId),
        db.prepare("DELETE FROM auth_attempts WHERE login=?").bind(row.login),
      ]);
      await openSession(db, request, row.userId, headers);
      return Response.json({ user: await currentUser(db, { id: row.userId, headers, authed: true, login: row.login }) }, { headers });
    }

    // Hisobga kirgan foydalanuvchi: parol yoki emailni o'zgartirish (joriy parol bilan tasdiqlanadi).
    if (p.type === "change_password" || p.type === "set_email") {
      if (!identity.authed) return fail("Avval hisobingizga kiring.", 401);
      const acc = await db.prepare("SELECT login, password_hash AS hash, salt, iterations FROM accounts WHERE user_id=?").bind(identity.id).first<{ login: string; hash: string; salt: string; iterations: number }>();
      if (!acc) return fail("Bu hisob Google yoki Telegram orqali ochilgan, unda parol yo'q.");
      const current = typeof p.current === "string" ? p.current : "";
      if (!sameHash(await hashPassword(current, acc.salt, acc.iterations), acc.hash)) return fail("Joriy parol noto'g'ri.", 403);
      if (p.type === "set_email") {
        const email = cleanEmail(p.email);
        if (email && !EMAIL_RE.test(email)) return fail("Email noto'g'ri.");
        if (email && await db.prepare("SELECT 1 FROM accounts WHERE email=? AND user_id<>?").bind(email, identity.id).first()) return fail("Bu email boshqa hisobga bog'langan.", 409);
        await db.prepare("UPDATE accounts SET email=? WHERE user_id=?").bind(email || null, identity.id).run();
        return Response.json({ ok: true, email: email || null }, { headers });
      }
      const next = typeof p.password === "string" ? p.password : "";
      const problem = passwordProblem(next);
      if (problem) return fail(problem);
      const { salt, hash } = await newPasswordFields(next);
      const token = request.headers.get("cookie")?.match(/(?:^|;\s*)bir_session=([a-f0-9]{64})(?:;|$)/)?.[1] ?? "";
      // Boshqa qurilmalardagi sessiyalar yopiladi, joriy qurilma qoladi.
      await db.batch([
        db.prepare("UPDATE accounts SET password_hash=?, salt=?, iterations=? WHERE user_id=?").bind(hash, salt, ITERATIONS, identity.id),
        db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").bind(identity.id, await sha256(token)),
      ]);
      return Response.json({ ok: true }, { headers });
    }

    const login = typeof p.login === "string" ? p.login.trim().toLowerCase() : "";
    const password = typeof p.password === "string" ? p.password : "";
    if (!LOGIN_RE.test(login)) return fail("Login 3–32 belgi: lotin harflari, raqam, _ yoki .");
    const pwProblem = passwordProblem(password);
    if (pwProblem) return fail(pwProblem);

    if (p.type === "register") {
      const name = typeof p.name === "string" ? p.name.trim().replace(/\s+/g, " ").slice(0, 40) : "";
      if (name.length < 2) return fail("Ismingizni kiriting.");
      const email = cleanEmail(p.email);
      if (email && !EMAIL_RE.test(email)) return fail("Email noto'g'ri.");
      if (await db.prepare("SELECT 1 FROM accounts WHERE login=?").bind(login).first()) return fail("Bu login band. Boshqasini tanlang.", 409);
      if (email && await db.prepare("SELECT 1 FROM accounts WHERE email=?").bind(email).first()) return fail("Bu email boshqa hisobga bog'langan.", 409);
      // Mehmon sifatida qilingan ishlar (savat va h.k.) yangi hisobga o'tadi; u mehmon allaqachon hisobga bog'langan bo'lsa yangi ID.
      const userId = await newAccountUserId(db, identity);
      const { salt, hash } = await newPasswordFields(password);
      await db.batch([
        db.prepare("INSERT INTO users (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=CURRENT_TIMESTAMP").bind(userId, name),
        db.prepare("INSERT INTO accounts (user_id, login, password_hash, salt, iterations, email) VALUES (?,?,?,?,?,?)").bind(userId, login, hash, salt, ITERATIONS, email || null),
      ]);
      await openSession(db, request, userId, headers);
      return Response.json({ user: { id: userId, login, name, email: email || null, providers: [] } }, { headers });
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

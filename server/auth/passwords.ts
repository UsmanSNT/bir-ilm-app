/**
 * Email + parol bilan kirish va parolni tiklash.
 *
 * - Parol: PBKDF2-HMAC-SHA256, 600 000 iteratsiya (OWASP 2023), 16 baytli tasodifiy tuz.
 *   Format: `pbkdf2-sha256$<iteratsiya>$<tuz b64>$<xesh b64>` — keyinchalik kuchaytirish oson.
 * - Taqqoslash doimiy vaqtda; yo'q hisob uchun ham soxta xesh hisoblanadi (vaqt orqali email aniqlanmasin).
 * - Urinishlar IP va email bo'yicha cheklanadi (server bitta Node jarayoni — xotiradagi hisob yetarli).
 * - Tiklash havolasi: 32 bayt token, bazada faqat SHA-256 xeshi, 30 daqiqa, bir martalik;
 *   ishlatilganda foydalanuvchining barcha sessiyalari yopiladi.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ApiException, badRequest, unauthorized } from "@/server/http/errors";
import { ensureUser } from "@/server/services/social";
import type { ChangePasswordInput, PasswordLoginInput, RegisterInput } from "@/shared/contract";
import { generateToken } from "./identity";
import { hashToken } from "./sessions";

const { authAccounts, passwordResets, userPasswords, userSessions, users } = schema;

const ITERATIONS = 600_000;
const RESET_MINUTES = 30;
const encoder = new TextEncoder();

const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const fromB64 = (value: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(value, "base64"));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  const iterations = Number(iter);
  if (scheme !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 1 || !salt || !hash) return false;
  return equalBytes(await derive(password, fromB64(salt), iterations), fromB64(hash));
}

// Yo'q hisob uchun ham bir xil vaqt sarflansin.
let dummyHash: Promise<string> | null = null;
const dummy = () => (dummyHash ??= hashPassword(crypto.randomUUID()));

// ── Urinishlarni cheklash ────────────────────────────────────────────

const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { login: 10, forgot: 3, register: 10, twofactor: 10, security: 5 } as const;
const attempts = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  return (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
}

/** Cheklovdan oshsa 429 tashlaydi; aks holda urinishni hisoblaydi. */
export function limitAttempt(kind: keyof typeof LIMITS, keys: string[], now = Date.now()): void {
  for (const key of keys) {
    if (recent(`${kind}:${key}`, now).length >= LIMITS[kind]) {
      throw new ApiException("rate_limited", "Urinishlar ko'p bo'ldi. 15 daqiqadan keyin qayta urining.", 429);
    }
  }
  for (const key of keys) attempts.set(`${kind}:${key}`, [...recent(`${kind}:${key}`, now), now]);
  if (attempts.size > 10_000) {
    for (const [key, times] of attempts) if (!times.some((t) => now - t < WINDOW_MS)) attempts.delete(key);
  }
}

/** Muvaffaqiyatli kirishdan keyin shu email bo'yicha hisob tozalanadi. */
export function clearAttempts(kind: keyof typeof LIMITS, key: string): void {
  attempts.delete(`${kind}:${key}`);
}

// ── Hisob ───────────────────────────────────────────────────────────

function newUserId(): string {
  return `reader_${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function emailAccount(db: Database, email: string) {
  return db.query.authAccounts.findFirst({ where: and(eq(authAccounts.provider, "email"), eq(authAccounts.subject, email)) });
}

/**
 * Ro'yxatdan o'tish. Hozirgi mehmon akkauntga bog'lanadi (savat, progress, postlar saqlanadi);
 * akkauntda allaqachon email bo'lsa — yangi akkaunt ochiladi.
 */
export async function registerWithPassword(db: Database, currentUserId: string, input: RegisterInput): Promise<string> {
  if (await emailAccount(db, input.email)) {
    throw new ApiException("bad_request", "Bu email bilan hisob bor. «Kirish» yoki «Parolni unutdingizmi?» dan foydalaning.", 409);
  }
  const hasEmail = await db.query.authAccounts.findFirst({
    where: and(eq(authAccounts.userId, currentUserId), eq(authAccounts.provider, "email")),
    columns: { id: true },
  });
  const userId = hasEmail ? newUserId() : currentUserId;
  const hash = await hashPassword(input.password);

  await ensureUser(db, userId);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true } });
  const taken = () => new ApiException("bad_request", "Bu email bilan hisob bor. «Kirish» yoki «Parolni unutdingizmi?» dan foydalaning.", 409);
  try {
    await db.batch([
    db.insert(authAccounts).values({ provider: "email", subject: input.email, userId, email: input.email, displayName: input.name }),
    db.insert(userPasswords).values({ userId, hash }).onConflictDoUpdate({ target: userPasswords.userId, set: { hash, updatedAt: new Date().toISOString() } }),
    ...(user?.name === "Kitobxon" || !user ? [db.update(users).set({ name: input.name, email: input.email }).where(eq(users.id, userId))] : []),
    ]);
  } catch (error) {
    // Parallel ro'yxatdan o'tish: noyob indeks ikkinchisini to'xtatadi.
    if (await emailAccount(db, input.email)) throw taken();
    throw error;
  }
  return userId;
}

/** Email + parol tekshiruvi. Xato bo'lsa — umumiy xabar (qaysi biri noto'g'riligi aytilmaydi). */
export async function loginWithPassword(db: Database, input: PasswordLoginInput): Promise<string> {
  const account = await emailAccount(db, input.email);
  const stored = account ? await db.query.userPasswords.findFirst({ where: eq(userPasswords.userId, account.userId) }) : null;
  const ok = await verifyPassword(input.password, stored?.hash ?? (await dummy()));
  if (!account || !stored || !ok) throw unauthorized("Email yoki parol noto'g'ri.");
  return account.userId;
}

export async function hasPassword(db: Database, userId: string): Promise<boolean> {
  return Boolean(await db.query.userPasswords.findFirst({ where: eq(userPasswords.userId, userId), columns: { userId: true } }));
}

/** Parolni o'zgartirish yoki (Google/Telegram bilan kirganlar uchun) birinchi marta o'rnatish. */
export async function changePassword(db: Database, userId: string, input: ChangePasswordInput): Promise<void> {
  const stored = await db.query.userPasswords.findFirst({ where: eq(userPasswords.userId, userId) });
  if (stored && !(await verifyPassword(input.current, stored.hash))) throw badRequest("Joriy parol noto'g'ri.");
  if (!stored) {
    const email = await db.query.authAccounts.findFirst({ where: and(eq(authAccounts.userId, userId), eq(authAccounts.provider, "email")), columns: { id: true } });
    if (!email) throw badRequest("Avval email bilan ro'yxatdan o'ting.");
  }
  const hash = await hashPassword(input.password);
  await db
    .insert(userPasswords)
    .values({ userId, hash })
    .onConflictDoUpdate({ target: userPasswords.userId, set: { hash, updatedAt: new Date().toISOString() } });
}

// ── Tiklash ─────────────────────────────────────────────────────────

/** Tiklash tokeni (faqat hisob mavjud bo'lsa). Qaytgan qiymat — xom token va hisob ma'lumoti. */
export async function createPasswordReset(db: Database, email: string) {
  const account = await emailAccount(db, email);
  if (!account) {
    await dummy();
    return null;
  }
  const telegram = await db.query.authAccounts.findFirst({
    where: and(eq(authAccounts.userId, account.userId), eq(authAccounts.provider, "telegram")),
    columns: { subject: true },
  });
  const token = generateToken();
  const expiresAt = new Date(Date.now() + RESET_MINUTES * 60_000).toISOString();
  await db.batch([
    // Avvalgi ishlatilmagan havolalar bekor — faqat oxirgisi ishlaydi.
    db.delete(passwordResets).where(and(eq(passwordResets.userId, account.userId), isNull(passwordResets.usedAt))),
    db.insert(passwordResets).values({ tokenHash: await hashToken(token), userId: account.userId, expiresAt }),
  ]);
  return { token, userId: account.userId, email: account.email ?? email, name: account.displayName, telegramChatId: telegram?.subject ?? null, minutes: RESET_MINUTES };
}

/** Yangi parol: token bir martalik; barcha eski sessiyalar yopiladi. Foydalanuvchi ID qaytadi. */
export async function resetPassword(db: Database, token: string, password: string): Promise<string> {
  const tokenHash = await hashToken(token);
  const row = await db.query.passwordResets.findFirst({
    where: and(eq(passwordResets.tokenHash, tokenHash), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date().toISOString())),
  });
  if (!row) throw badRequest("Havola eskirgan yoki ishlatilgan. Yangisini so'rang.");
  const hash = await hashPassword(password);
  const stamp = new Date().toISOString();
  await db.batch([
    db.insert(userPasswords).values({ userId: row.userId, hash }).onConflictDoUpdate({ target: userPasswords.userId, set: { hash, updatedAt: stamp } }),
    db.update(passwordResets).set({ usedAt: stamp }).where(eq(passwordResets.userId, row.userId)),
    db.delete(userSessions).where(eq(userSessions.userId, row.userId)),
  ]);
  return row.userId;
}

/**
 * Ikki bosqichli himoya.
 *
 * Foydalanuvchi o'zi xavfsizlik kodi qo'yadi (PBKDF2, parol bilan bir xil sxema). Birinchi bosqich
 * (email+parol, Google, Telegram) o'tgach sessiya darrov ochilmaydi: bir martalik `challenge` beriladi
 * (bazada faqat SHA-256 xeshi, 10 daqiqa, 5 ta urinish), sessiya faqat to'g'ri kod bilan ochiladi.
 */
import { and, eq, gt } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ApiException, badRequest, unauthorized } from "@/server/http/errors";
import type { RemoveTwoFactorInput, SetTwoFactorInput, TwoFactorPending } from "@/shared/contract";
import { generateToken } from "./identity";
import { hashPassword, verifyPassword } from "./passwords";
import { hashToken } from "./sessions";

const { loginChallenges, userSecurityCodes } = schema;

export const CHALLENGE_MINUTES = 10;
export const MAX_CHALLENGE_ATTEMPTS = 5;
/** Google/Telegram qaytishida challenge shu cookie'da turadi (JS o'qiy olmaydi). */
export const CHALLENGE_COOKIE = "bir_2fa";

export async function hasTwoFactor(db: Database, userId: string): Promise<boolean> {
  return Boolean(await db.query.userSecurityCodes.findFirst({ where: eq(userSecurityCodes.userId, userId), columns: { userId: true } }));
}

async function verifyCurrent(db: Database, userId: string, code: string): Promise<boolean> {
  const row = await db.query.userSecurityCodes.findFirst({ where: eq(userSecurityCodes.userId, userId) });
  return row ? verifyPassword(code, row.hash) : false;
}

/** Kodni birinchi marta qo'yish yoki almashtirish (almashtirishda joriy kod kerak). */
export async function setTwoFactor(db: Database, userId: string, input: SetTwoFactorInput): Promise<void> {
  if (await hasTwoFactor(db, userId)) {
    if (!(await verifyCurrent(db, userId, input.current))) throw badRequest("Joriy kod noto'g'ri.");
  }
  const hash = await hashPassword(input.code);
  await db
    .insert(userSecurityCodes)
    .values({ userId, hash })
    .onConflictDoUpdate({ target: userSecurityCodes.userId, set: { hash, updatedAt: new Date().toISOString() } });
}

export async function removeTwoFactor(db: Database, userId: string, input: RemoveTwoFactorInput): Promise<void> {
  if (!(await verifyCurrent(db, userId, input.current))) throw badRequest("Joriy kod noto'g'ri.");
  await db.delete(userSecurityCodes).where(eq(userSecurityCodes.userId, userId));
}

/** Kod qo'yilgan bo'lsa — challenge yaratadi; qo'yilmagan bo'lsa null (sessiya darrov ochiladi). */
export async function startChallenge(db: Database, userId: string): Promise<TwoFactorPending | null> {
  if (!(await hasTwoFactor(db, userId))) return null;
  const challenge = generateToken();
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60_000).toISOString();
  await db.insert(loginChallenges).values({ tokenHash: await hashToken(challenge), userId, expiresAt });
  return { twoFactor: true, challenge };
}

/** Kodni tekshiradi; to'g'ri bo'lsa challenge bir martalik sarflanadi va userId qaytadi. */
export async function completeChallenge(db: Database, challenge: string, code: string): Promise<string> {
  const tokenHash = await hashToken(challenge);
  const now = new Date().toISOString();
  const row = await db.query.loginChallenges.findFirst({
    where: and(eq(loginChallenges.tokenHash, tokenHash), gt(loginChallenges.expiresAt, now)),
  });
  if (!row) throw badRequest("Kirish muddati tugadi. Qaytadan kiring.");
  if (row.attempts >= MAX_CHALLENGE_ATTEMPTS) {
    await db.delete(loginChallenges).where(eq(loginChallenges.tokenHash, tokenHash));
    throw new ApiException("rate_limited", "Urinishlar ko'p bo'ldi. Qaytadan kiring.", 429);
  }
  if (!(await verifyCurrent(db, row.userId, code))) {
    await db.update(loginChallenges).set({ attempts: row.attempts + 1 }).where(eq(loginChallenges.tokenHash, tokenHash));
    throw unauthorized("Xavfsizlik kodi noto'g'ri.");
  }
  await db.delete(loginChallenges).where(eq(loginChallenges.tokenHash, tokenHash));
  return row.userId;
}

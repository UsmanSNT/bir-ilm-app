/**
 * Boshqa qurilmani kod bilan ulash.
 *
 * Kirgan qurilma 6 xonali kod oladi; ikkinchi qurilma shu kodni kiritsa, o'sha
 * akkauntga yangi sessiya ochiladi (rol, postlar, progress — hammasi bir xil).
 * Kod 10 daqiqa amal qiladi, bir marta ishlatiladi, bazada faqat xeshi turadi.
 * Taxmin qilishning oldini olish uchun urinishlar IP va umumiy bo'yicha cheklanadi.
 */
import { eq, lt } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { hashToken } from "./sessions";

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS_PER_IP = 8;
const MAX_FAILS_TOTAL = 200;

const { loginCodes } = schema;

function randomCode(): string {
  // Modul qiyshiqligisiz tekis taqsimot: 4 294 000 000 dan kattalarini tashlaymiz.
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= 4_294_000_000);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

export async function createLinkCode(db: Database, userId: string): Promise<{ code: string; expiresAt: string }> {
  const now = Date.now();
  await db.delete(loginCodes).where(lt(loginCodes.expiresAt, new Date(now).toISOString()));
  // Bir foydalanuvchida bir vaqtda bitta kod: yangisi eskisini bekor qiladi.
  await db.delete(loginCodes).where(eq(loginCodes.userId, userId));
  const expiresAt = new Date(now + LINK_CODE_TTL_MS).toISOString();
  for (;;) {
    const code = randomCode();
    const codeHash = await hashToken(`link:${code}`);
    const taken = await db.query.loginCodes.findFirst({ where: eq(loginCodes.codeHash, codeHash), columns: { userId: true } });
    if (taken) continue;
    await db.insert(loginCodes).values({ codeHash, userId, expiresAt });
    return { code, expiresAt };
  }
}

/** Kod to'g'ri bo'lsa akkaunt ID sini qaytaradi va kodni o'chiradi. */
export async function redeemLinkCode(db: Database, code: string): Promise<string | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const codeHash = await hashToken(`link:${code}`);
  const row = await db.query.loginCodes.findFirst({ where: eq(loginCodes.codeHash, codeHash) });
  if (!row) return null;
  await db.delete(loginCodes).where(eq(loginCodes.codeHash, codeHash));
  return row.expiresAt > new Date().toISOString() ? row.userId : null;
}

// Xotiradagi hisoblagich: server qayta ishga tushsa nollanadi, bu yetarli.
const fails = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const list = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) fails.set(key, list);
  else fails.delete(key);
  return list;
}

export function isLinkRateLimited(ip: string, now = Date.now()): boolean {
  return recent(`ip:${ip}`, now).length >= MAX_FAILS_PER_IP || recent("*", now).length >= MAX_FAILS_TOTAL;
}

export function recordLinkFailure(ip: string, now = Date.now()) {
  for (const key of [`ip:${ip}`, "*"]) fails.set(key, [...recent(key, now), now]);
}

/** Caddy mijoz IP sini `X-Forwarded-For` ga yozadi (tashqaridan kelganini almashtiradi). */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

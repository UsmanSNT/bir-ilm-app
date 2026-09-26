/**
 * Bir martalik kirish kodlari.
 *
 * link    — kirgan qurilma 6 xonali kod oladi; ikkinchi qurilma shu kodni kiritsa,
 *           o'sha akkauntga yangi sessiya ochiladi (rol, postlar, progress — hammasi bir xil).
 * flow    — ilova Google/Telegram kirishini telefon brauzerida boshlaydi; kod qaysi
 *           ilova foydalanuvchisi kirayotganini va PKCE `challenge`ni eslab qoladi.
 * handoff — brauzer kirishni tugatib, `uz.birilm.app://auth?code=…` orqali ilovaga
 *           qaytaradi; ilova tokenni faqat `verifier` bilan oladi, shuning uchun havolani
 *           ushlab qolgan boshqa ilova undan foydalana olmaydi.
 *
 * Kodlar bazada faqat xesh ko'rinishida turadi va bir marta ishlatiladi. Taxmin
 * qilishning oldini olish uchun xato urinishlar IP va umumiy bo'yicha cheklanadi.
 */
import { and, eq, lt } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { generateToken } from "./identity";
import type { ProviderProfile } from "./providers";
import { hashToken } from "./sessions";

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const FLOW_TTL_MS = 10 * 60 * 1000;
const HANDOFF_TTL_MS = 3 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS_PER_IP = 8;
const MAX_FAILS_TOTAL = 200;

const { loginCodes } = schema;
type Kind = "link" | "flow" | "handoff";

const hashOf = (kind: Kind, code: string) => hashToken(`${kind}:${code}`);

function randomCode(): string {
  // Modul qiyshiqligisiz tekis taqsimot: 4 294 000 000 dan kattalarini tashlaymiz.
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= 4_294_000_000);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

async function dropExpired(db: Database) {
  await db.delete(loginCodes).where(lt(loginCodes.expiresAt, new Date().toISOString()));
}

/** Kodni topadi va o'chiradi (bir martalik). Muddati o'tgan bo'lsa `null`. */
async function take(db: Database, kind: Kind, code: string) {
  const codeHash = await hashOf(kind, code);
  const row = await db.query.loginCodes.findFirst({
    where: and(eq(loginCodes.codeHash, codeHash), eq(loginCodes.kind, kind)),
  });
  if (!row) return null;
  await db.delete(loginCodes).where(eq(loginCodes.codeHash, codeHash));
  return row.expiresAt > new Date().toISOString() ? row : null;
}

// ── Boshqa qurilmani ulash (6 xonali) ──────────────────────────────────

export async function createLinkCode(db: Database, userId: string): Promise<{ code: string; expiresAt: string }> {
  await dropExpired(db);
  // Bir foydalanuvchida bir vaqtda bitta kod: yangisi eskisini bekor qiladi.
  await db.delete(loginCodes).where(and(eq(loginCodes.userId, userId), eq(loginCodes.kind, "link")));
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();
  for (;;) {
    const code = randomCode();
    const codeHash = await hashOf("link", code);
    const taken = await db.query.loginCodes.findFirst({ where: eq(loginCodes.codeHash, codeHash), columns: { userId: true } });
    if (taken) continue;
    await db.insert(loginCodes).values({ codeHash, userId, expiresAt, kind: "link" });
    return { code, expiresAt };
  }
}

/** Kod to'g'ri bo'lsa akkaunt ID sini qaytaradi va kodni o'chiradi. */
export async function redeemLinkCode(db: Database, code: string): Promise<string | null> {
  if (!/^\d{6}$/.test(code)) return null;
  return (await take(db, "link", code))?.userId ?? null;
}

// ── Ilova: brauzerda kirish va ilovaga qaytish ─────────────────────────

/** Ilova boshlagan kirish oqimi. `userId` — ilovaning hozirgi (mehmon) foydalanuvchisi. */
export async function createAppFlow(db: Database, userId: string, challenge: string): Promise<string> {
  await dropExpired(db);
  const flow = generateToken();
  await db.insert(loginCodes).values({
    codeHash: await hashOf("flow", flow),
    userId,
    challenge,
    kind: "flow",
    expiresAt: new Date(Date.now() + FLOW_TTL_MS).toISOString(),
  });
  return flow;
}

/** Oqim hali amal qiladimi — o'chirmasdan tekshiradi (Google'ga yo'naltirishdan oldin). */
export async function peekAppFlow(db: Database, flow: string) {
  if (!/^[a-f0-9]{64}$/.test(flow)) return null;
  const row = await db.query.loginCodes.findFirst({
    where: and(eq(loginCodes.codeHash, await hashOf("flow", flow)), eq(loginCodes.kind, "flow")),
  });
  return row && row.expiresAt > new Date().toISOString() ? row : null;
}

export async function takeAppFlow(db: Database, flow: string) {
  return /^[a-f0-9]{64}$/.test(flow) ? take(db, "flow", flow) : null;
}

/**
 * Brauzer profilni tasdiqladi: ilovaga qaytariladigan qisqa muddatli kod. Akkaunt hali
 * bog'lanmaydi — buni ilova kod va `verifier` bilan qaytarganda qilamiz, shunda begona
 * havola orqali kirgan odamning Google'i boshqa birovning akkauntiga ulanib qolmaydi.
 */
export async function createHandoff(
  db: Database,
  flow: { userId: string; challenge: string },
  profile: ProviderProfile,
): Promise<string> {
  const code = generateToken();
  await db.insert(loginCodes).values({
    codeHash: await hashOf("handoff", code),
    userId: flow.userId,
    challenge: flow.challenge,
    payload: JSON.stringify(profile),
    kind: "handoff",
    expiresAt: new Date(Date.now() + HANDOFF_TTL_MS).toISOString(),
  });
  return code;
}

/**
 * Ilova kodni va o'zi saqlagan `verifier`ni yuboradi. Mos kelsa — oqimni boshlagan ilova
 * foydalanuvchisi va tasdiqlangan profil.
 */
export async function redeemHandoff(
  db: Database,
  code: string,
  verifier: string,
): Promise<{ userId: string; profile: ProviderProfile } | null> {
  if (!/^[a-f0-9]{64}$/.test(code)) return null;
  const row = await take(db, "handoff", code);
  if (!row?.challenge || !row.payload) return null;
  if ((await hashToken(verifier)) !== row.challenge) return null;
  return { userId: row.userId, profile: JSON.parse(row.payload) as ProviderProfile };
}

// ── Urinishlarni cheklash ─────────────────────────────────────────────

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

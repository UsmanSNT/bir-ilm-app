/**
 * Login sessiyalari.
 *
 * Token hech qachon bazada ochiq saqlanmaydi — faqat SHA-256 xeshi. Xesh
 * `user_sessions`da bo'lsa, token o'sha foydalanuvchiga tegishli (Google yoki
 * Telegram orqali kirgan). Bo'lmasa, eski mehmon tartibi: `reader_<xesh>`.
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { generateToken } from "./identity";

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function userIdForToken(db: Database, token: string): Promise<string> {
  const tokenHash = await hashToken(token);
  const row = await db.query.userSessions.findFirst({
    where: eq(schema.userSessions.tokenHash, tokenHash),
    columns: { userId: true },
  });
  return row?.userId ?? `reader_${tokenHash}`;
}

export async function createSession(db: Database, userId: string): Promise<string> {
  const token = generateToken();
  await db.insert(schema.userSessions).values({ tokenHash: await hashToken(token), userId });
  return token;
}

export async function deleteSession(db: Database, token: string): Promise<void> {
  await db.delete(schema.userSessions).where(eq(schema.userSessions.tokenHash, await hashToken(token)));
}

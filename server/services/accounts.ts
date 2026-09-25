/** Google / Telegram hisoblarini foydalanuvchiga bog'lash. */
import { and, eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import type { ProviderProfile } from "@/server/auth/providers";
import type { LinkedAccount } from "@/shared/contract";
import { ensureUser } from "./social";

const { authAccounts, users } = schema;

function newUserId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `reader_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Kirgan hisobning foydalanuvchisini qaytaradi.
 *
 * Hisob birinchi marta kirayotgan bo'lsa, hozirgi mehmon akkauntga bog'lanadi —
 * shunda postlar, progress va rollar yo'qolmaydi. Faqat hozirgi akkauntda shu
 * provayderning boshqa hisobi bo'lsa (masalan, ikkinchi Google), yangi akkaunt ochiladi.
 */
export async function signInWithProvider(
  db: Database,
  currentUserId: string,
  profile: ProviderProfile,
): Promise<string> {
  const name = profile.name.trim().slice(0, 40) || "Kitobxon";
  const existing = await db.query.authAccounts.findFirst({
    where: and(eq(authAccounts.provider, profile.provider), eq(authAccounts.subject, profile.subject)),
  });
  if (existing) {
    await db
      .update(authAccounts)
      .set({ displayName: name, email: profile.email })
      .where(eq(authAccounts.id, existing.id));
    return existing.userId;
  }

  const sameProvider = await db.query.authAccounts.findFirst({
    where: and(eq(authAccounts.userId, currentUserId), eq(authAccounts.provider, profile.provider)),
  });
  const userId = sameProvider ? newUserId() : currentUserId;
  await ensureUser(db, userId);
  await db.insert(authAccounts).values({
    provider: profile.provider,
    subject: profile.subject,
    userId,
    email: profile.email,
    displayName: name,
  });

  // Mehmon hali ismini o'zgartirmagan bo'lsa, hisobdagi ism va rasmni olamiz.
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const patch: { name?: string; avatarUrl?: string } = {};
  if (user && user.name === "Kitobxon") patch.name = name;
  if (user && !user.avatarUrl && profile.avatarUrl) patch.avatarUrl = profile.avatarUrl;
  if (Object.keys(patch).length) await db.update(users).set(patch).where(eq(users.id, userId));
  return userId;
}

export async function listAccounts(db: Database, userId: string): Promise<LinkedAccount[]> {
  const rows = await db.query.authAccounts.findMany({
    where: eq(authAccounts.userId, userId),
    columns: { provider: true, email: true, displayName: true },
  });
  return rows.map((r) => ({ provider: r.provider, label: r.email ?? r.displayName }));
}

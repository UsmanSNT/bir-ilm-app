/**
 * Profil rasmlari: avatar va shaxsiy sahifa orqa foni.
 * Diskda BIR_ILM_MEDIA_DIR/profile/<tasodifiy>.<ext>; eski fayl almashtirilganda o'chiriladi.
 * Fayl nomi har safar yangi — URL o'zgarmas (immutable) keshlanadi.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ApiException, badRequest } from "@/server/http/errors";
import { mediaRoot } from "./books";
import { requireSignedIn } from "./community";
import { hasImageSignature, IMAGE_EXT } from "./store-chat";

const { users } = schema;

export const PROFILE_IMAGE_KINDS = ["avatar", "cover"] as const;
export type ProfileImageKind = (typeof PROFILE_IMAGE_KINDS)[number];
export const PROFILE_IMAGE_LIMITS: Record<ProfileImageKind, number> = { avatar: 3 * 1024 * 1024, cover: 6 * 1024 * 1024 };
export const PROFILE_FILE = /^[a-z0-9]{16,32}\.(jpg|png|webp)$/;
const PREFIX = "/media/profile/";

export const profileDir = () => path.join(mediaRoot(), "profile");

/** Faqat o'zimizning profil fayllari diskdan o'chiriladi (Google/Telegram rasmlari — tashqi URL). */
async function removeOld(url: string | null): Promise<void> {
  if (!url?.startsWith(PREFIX)) return;
  const file = url.slice(PREFIX.length).split("?")[0];
  if (PROFILE_FILE.test(file)) await rm(path.join(profileDir(), file), { force: true });
}

export async function setProfileImage(db: Database, userId: string, kind: ProfileImageKind, mime: string, bytes: Uint8Array): Promise<string> {
  await requireSignedIn(db, userId, "Rasm yuklash");
  if (!(mime in IMAGE_EXT)) throw badRequest("Faqat JPG, PNG yoki WebP rasm yuklang.");
  if (!bytes.length) throw badRequest("Rasm bo'sh.");
  if (bytes.length > PROFILE_IMAGE_LIMITS[kind]) {
    throw new ApiException("bad_request", `Rasm ${PROFILE_IMAGE_LIMITS[kind] / 1024 / 1024} MB dan oshmasin.`, 413);
  }
  if (!hasImageSignature(mime, bytes.subarray(0, 16))) throw badRequest("Fayl rasm emas.");

  const file = `${Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20)}.${IMAGE_EXT[mime]}`;
  await mkdir(profileDir(), { recursive: true });
  await writeFile(path.join(profileDir(), file), bytes);

  const column = kind === "avatar" ? "avatarUrl" : "coverUrl";
  const before = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { avatarUrl: true, coverUrl: true } });
  const url = `${PREFIX}${file}`;
  await db.update(users).set({ [column]: url, updatedAt: new Date().toISOString() }).where(eq(users.id, userId));
  await removeOld(before?.[column] ?? null);
  return url;
}

export async function clearProfileImage(db: Database, userId: string, kind: ProfileImageKind): Promise<void> {
  const column = kind === "avatar" ? "avatarUrl" : "coverUrl";
  const before = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { avatarUrl: true, coverUrl: true } });
  await db.update(users).set({ [column]: null, updatedAt: new Date().toISOString() }).where(eq(users.id, userId));
  await removeOld(before?.[column] ?? null);
}

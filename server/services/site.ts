/** Ijtimoiy tarmoq havolalari va qisqa videolar (faqat havola saqlanadi). */
import { desc, eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { badRequest, notFound, validationFailed } from "@/server/http/errors";
import {
  normalizeSocialUrl,
  parseVideoUrl,
  SOCIAL_KEYS,
  SOCIAL_LABELS,
  type AddVideoInput,
  type SiteLinks,
  type SiteLinksInput,
  type SiteVideo,
} from "@/shared/contract";

const { siteLinks, videoLinks } = schema;
const MAX_VIDEOS = 60;

export async function getSiteLinks(db: Database): Promise<SiteLinks> {
  const rows = await db.select().from(siteLinks);
  return Object.fromEntries(rows.map((r) => [r.key, r.url]));
}

/** Yuborilgan har bir tarmoq tekshiriladi; bo'sh qator havolani o'chiradi, yuborilmaganiga tegilmaydi. */
export async function saveSiteLinks(db: Database, input: SiteLinksInput): Promise<SiteLinks> {
  const stamp = new Date().toISOString();
  const errors: Record<string, string[]> = {};
  const ops: Array<{ key: (typeof SOCIAL_KEYS)[number]; url: string }> = [];
  for (const key of SOCIAL_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    const url = normalizeSocialUrl(key, value);
    if (url === null) errors[key] = [`${SOCIAL_LABELS[key]} havolasi noto'g'ri: shu tarmoqning o'z manzilini yozing.`];
    else ops.push({ key, url });
  }
  if (Object.keys(errors).length) throw validationFailed(errors);
  for (const { key, url } of ops) {
    if (!url) await db.delete(siteLinks).where(eq(siteLinks.key, key));
    else await db.insert(siteLinks).values({ key, url, updatedAt: stamp }).onConflictDoUpdate({ target: siteLinks.key, set: { url, updatedAt: stamp } });
  }
  return getSiteLinks(db);
}

const toVideo = (row: typeof videoLinks.$inferSelect): SiteVideo => ({
  id: row.id,
  platform: row.platform,
  url: row.url,
  externalId: row.externalId,
  title: row.title,
  createdAt: row.createdAt,
});

export async function listVideos(db: Database): Promise<SiteVideo[]> {
  const rows = await db.select().from(videoLinks).orderBy(desc(videoLinks.createdAt)).limit(MAX_VIDEOS);
  return rows.map(toVideo);
}

export async function addVideo(db: Database, userId: string, input: AddVideoInput): Promise<SiteVideo> {
  const parsed = parseVideoUrl(input.url);
  if (!parsed) throw badRequest("Faqat YouTube, Instagram yoki Facebook video havolasini qo'shing.");
  const existing = (await db.select().from(videoLinks).where(eq(videoLinks.url, parsed.url)))[0];
  if (existing) return toVideo(existing);
  const count = (await db.select({ id: videoLinks.id }).from(videoLinks)).length;
  if (count >= MAX_VIDEOS) throw badRequest(`Videolar ${MAX_VIDEOS} tadan oshmasin: eskisini o'chiring.`);
  const id = `vid_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const [row] = await db.insert(videoLinks).values({ id, ...parsed, title: input.title, createdBy: userId, createdAt: new Date().toISOString() }).returning();
  return toVideo(row);
}

export async function deleteVideo(db: Database, id: string): Promise<void> {
  const row = await db.query.videoLinks.findFirst({ where: eq(videoLinks.id, id), columns: { id: true } });
  if (!row) throw notFound("Video topilmadi.");
  await db.delete(videoLinks).where(eq(videoLinks.id, id));
}

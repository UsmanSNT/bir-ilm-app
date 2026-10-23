/**
 * Loyiha jamoasi. O'qish — hamma (faqat ko'rinadiganlar), boshqarish — faqat admin (route'da tekshiriladi).
 * Rasmlar diskda: BIR_ILM_MEDIA_DIR/team/<tasodifiy>.<ext>; almashtirilganda yoki a'zo o'chirilganda eski fayl o'chadi.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ApiException, badRequest, notFound } from "@/server/http/errors";
import { TEAM_LIMITS, type TeamMember, type TeamMemberData, type TeamMoveInput } from "@/shared/contract";
import { mediaRoot } from "./books";
import { hasImageSignature, IMAGE_EXT } from "./store-chat";

const { teamMembers } = schema;

export const TEAM_FILE = /^[a-z0-9]{16,32}\.(jpg|png|webp)$/;
const PREFIX = "/media/team/";
export const teamDir = () => path.join(mediaRoot(), "team");

const toMember = (row: typeof teamMembers.$inferSelect): TeamMember => ({
  id: row.id,
  name: row.name,
  role: row.role,
  bio: row.bio,
  photoUrl: row.photoUrl,
  telegram: row.telegram,
  instagram: row.instagram,
  youtube: row.youtube,
  facebook: row.facebook,
  website: row.website,
  avatar: row.avatar,
  former: row.former,
  period: row.period,
  visible: row.visible,
  sortOrder: row.sortOrder,
});

export async function listTeam(db: Database, includeHidden = false): Promise<TeamMember[]> {
  const rows = await db
    .select()
    .from(teamMembers)
    .where(includeHidden ? undefined : eq(teamMembers.visible, true))
    // Avval hozirgi jamoa, keyin sobiq a'zolar; har guruh ichida admin belgilagan tartib.
    .orderBy(asc(teamMembers.former), asc(teamMembers.sortOrder), asc(teamMembers.createdAt));
  return rows.map(toMember);
}

async function findMember(db: Database, id: string) {
  const row = await db.query.teamMembers.findFirst({ where: eq(teamMembers.id, id) });
  if (!row) throw notFound("Jamoa a'zosi topilmadi.");
  return row;
}

async function removePhotoFile(url: string | null): Promise<void> {
  if (!url?.startsWith(PREFIX)) return;
  const file = url.slice(PREFIX.length);
  if (TEAM_FILE.test(file)) await rm(path.join(teamDir(), file), { force: true });
}

/** Yangi a'zo ro'yxat oxiriga qo'shiladi. */
export async function createTeamMember(db: Database, actorId: string, input: TeamMemberData): Promise<TeamMember[]> {
  const [{ count, last }] = await db
    .select({ count: sql<number>`count(*)`, last: sql<number>`coalesce(max(${teamMembers.sortOrder}), 0)` })
    .from(teamMembers);
  if (Number(count) >= TEAM_LIMITS.members) throw badRequest(`Jamoa ${TEAM_LIMITS.members} kishidan oshmasin.`);
  const stamp = new Date().toISOString();
  await db.insert(teamMembers).values({
    id: `team_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    ...input,
    sortOrder: Number(last) + 1,
    createdBy: actorId,
    createdAt: stamp,
    updatedAt: stamp,
  });
  return listTeam(db, true);
}

export async function updateTeamMember(db: Database, id: string, input: TeamMemberData): Promise<TeamMember[]> {
  const row = await findMember(db, id);
  const patch: Partial<typeof teamMembers.$inferInsert> = { ...input, updatedAt: new Date().toISOString() };
  if (input.former !== row.former) {
    // Boshqa guruhga o'tgan a'zo o'sha guruhning oxiriga tushadi.
    const [{ last }] = await db.select({ last: sql<number>`coalesce(max(${teamMembers.sortOrder}), 0)` }).from(teamMembers);
    patch.sortOrder = Number(last) + 1;
  }
  await db.update(teamMembers).set(patch).where(eq(teamMembers.id, id));
  return listTeam(db, true);
}

export async function deleteTeamMember(db: Database, id: string): Promise<TeamMember[]> {
  const row = await findMember(db, id);
  await db.delete(teamMembers).where(eq(teamMembers.id, id));
  await removePhotoFile(row.photoUrl);
  return listTeam(db, true);
}

/**
 * O'z guruhidagi (hozirgi jamoa yoki sobiq a'zolar) qo'shni a'zo bilan o'rin almashtiradi va tartibni
 * 1..n qilib qayta yozadi (bo'shliq va takror qolmaydi).
 */
export async function moveTeamMember(db: Database, id: string, { direction }: TeamMoveInput): Promise<TeamMember[]> {
  const members = await listTeam(db, true);
  const ids = members.map((member) => member.id);
  const from = ids.indexOf(id);
  if (from === -1) throw notFound("Jamoa a'zosi topilmadi.");
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length || members[to].former !== members[from].former) return members;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  const statements = ids.map((memberId, index) => db.update(teamMembers).set({ sortOrder: index + 1 }).where(eq(teamMembers.id, memberId)));
  await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
  return listTeam(db, true);
}

export async function setTeamPhoto(db: Database, id: string, mime: string, bytes: Uint8Array): Promise<TeamMember[]> {
  const row = await findMember(db, id);
  if (!(mime in IMAGE_EXT)) throw badRequest("Faqat JPG, PNG yoki WebP rasm yuklang.");
  if (!bytes.length) throw badRequest("Rasm bo'sh.");
  if (bytes.length > TEAM_LIMITS.photoBytes) {
    throw new ApiException("bad_request", `Rasm ${TEAM_LIMITS.photoBytes / 1024 / 1024} MB dan oshmasin.`, 413);
  }
  if (!hasImageSignature(mime, bytes.subarray(0, 16))) throw badRequest("Fayl rasm emas.");

  const file = `${Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20)}.${IMAGE_EXT[mime]}`;
  await mkdir(teamDir(), { recursive: true });
  await writeFile(path.join(teamDir(), file), bytes);
  await db.update(teamMembers).set({ photoUrl: `${PREFIX}${file}`, updatedAt: new Date().toISOString() }).where(eq(teamMembers.id, id));
  await removePhotoFile(row.photoUrl);
  return listTeam(db, true);
}

export async function clearTeamPhoto(db: Database, id: string): Promise<TeamMember[]> {
  const row = await findMember(db, id);
  await db.update(teamMembers).set({ photoUrl: null, updatedAt: new Date().toISOString() }).where(eq(teamMembers.id, id));
  await removePhotoFile(row.photoUrl);
  return listTeam(db, true);
}

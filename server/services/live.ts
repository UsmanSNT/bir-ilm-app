/**
 * Jonli suhbat domen mantiqi.
 *
 * HTTP va WebSocket'dan mustaqil — ikkalasi ham shu funksiyalarni chaqiradi.
 */
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ensureUser } from "./social";
import { mediaRoot } from "./books";
import { badRequest, notFound } from "@/server/http/errors";
import type {
  CreateLiveSessionInput,
  LiveSession,
  LiveParticipant,
  LiveMessage,
  LiveRole,
  LiveRecording,
} from "@/shared/contract/live";

function sessionId(): string {
  return `live_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

// ── Sessiya CRUD ────────────────────────────────────────────────────

export async function createLiveSession(
  db: Database,
  moderatorId: string,
  input: CreateLiveSessionInput,
): Promise<LiveSession> {
  const id = sessionId();
  await ensureUser(db, moderatorId);
  await db.insert(schema.liveSessions).values({
    id,
    bookTitle: input.bookTitle,
    title: input.title,
    scheduledAt: input.scheduledAt,
    moderatorId,
  });
  return (await getLiveSession(db, id))!;
}

type SessionRow = typeof schema.liveSessions.$inferSelect;
type RecordingRow = typeof schema.liveRecordings.$inferSelect;

export const LIVE_ID_PATTERN = /^live_[a-z0-9]{6,32}$/;
export const LIVE_FILE_PATTERN = /^(archive|rec-[a-z0-9]{6,32})\.[a-z0-9]{2,5}$/;

/** Suhbat fayllari: BIR_ILM_MEDIA_DIR/live/<suhbat-id>/ */
export function liveDir(id: string): string {
  if (!LIVE_ID_PATTERN.test(id)) throw notFound("Suhbat topilmadi.");
  return path.join(mediaRoot(), "live", id);
}

export async function ensureLiveDir(id: string): Promise<string> {
  const dir = liveDir(id);
  await mkdir(dir, { recursive: true });
  return dir;
}

function toRecording(row: RecordingRow): LiveRecording {
  return {
    id: row.id,
    url: `/media/live/${row.sessionId}/${row.file}`,
    mime: row.mime,
    bytes: row.bytes,
    seconds: row.seconds,
    createdAt: sqliteUtcToIso(row.createdAt),
  };
}

function toSession(row: SessionRow, participantCount: number, recordings: RecordingRow[] = []): LiveSession {
  return {
    id: row.id,
    bookTitle: row.bookTitle,
    title: row.title,
    status: row.status,
    scheduledAt: row.scheduledAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    moderatorId: row.moderatorId,
    participantCount,
    recording: Boolean(row.recordingBy),
    archive: row.archiveFile
      ? {
          url: `/media/live/${row.id}/${row.archiveFile}?v=${encodeURIComponent(row.archivedAt ?? "")}`,
          seconds: row.archiveSeconds,
          bytes: row.archiveBytes,
        }
      : null,
    recordings: recordings.map(toRecording),
  };
}

/** `staff` — admin/moderator: xom yozuvlar ham qo'shiladi. */
export async function getLiveSession(
  db: Database,
  id: string,
  staff = false,
): Promise<LiveSession | null> {
  const row = await db.query.liveSessions.findFirst({
    where: eq(schema.liveSessions.id, id),
  });
  if (!row) return null;
  const count = await db
    .select({ c: sql<number>`count(*)` })
    .from(schema.liveParticipants)
    .where(eq(schema.liveParticipants.sessionId, id));
  const recordings = staff
    ? await db.query.liveRecordings.findMany({
        where: eq(schema.liveRecordings.sessionId, id),
        orderBy: asc(schema.liveRecordings.createdAt),
      })
    : [];
  return toSession(row, count[0]?.c ?? 0, recordings);
}

/**
 * Ro'yxat. Oddiy foydalanuvchi tugagan suhbatni faqat ishlov berilgan audio joylangandan
 * keyin ko'radi; admin/moderator hammasini va xom yozuvlarni ko'radi.
 */
export async function listLiveSessions(
  db: Database,
  staff = false,
): Promise<LiveSession[]> {
  const rows = await db.query.liveSessions.findMany({
    orderBy: desc(schema.liveSessions.scheduledAt),
    limit: 50,
  });
  const visible = staff ? rows : rows.filter((r) => r.status !== "ended" || r.archiveFile);
  const counts = await db
    .select({
      sessionId: schema.liveParticipants.sessionId,
      c: sql<number>`count(*)`,
    })
    .from(schema.liveParticipants)
    .groupBy(schema.liveParticipants.sessionId);
  const countMap = new Map(counts.map((r) => [r.sessionId, r.c]));
  const recordings = staff
    ? await db.query.liveRecordings.findMany({ orderBy: asc(schema.liveRecordings.createdAt) })
    : [];
  return visible.map((r) =>
    toSession(r, countMap.get(r.id) ?? 0, recordings.filter((rec) => rec.sessionId === r.id)),
  );
}

/** Suhbatni butunlay o'chiradi (izohlar, yozuvlar va fayllar bilan). */
export async function deleteLiveSession(db: Database, id: string): Promise<void> {
  const row = await db.query.liveSessions.findFirst({ where: eq(schema.liveSessions.id, id) });
  if (!row) throw notFound("Suhbat topilmadi.");
  await db.delete(schema.liveSessions).where(eq(schema.liveSessions.id, id));
  await rm(liveDir(id), { recursive: true, force: true });
}

// ── Yozib olish ─────────────────────────────────────────────────────

export async function setRecordingBy(db: Database, id: string, userId: string | null): Promise<void> {
  await db.update(schema.liveSessions).set({ recordingBy: userId }).where(eq(schema.liveSessions.id, id));
}

export async function createRecording(
  db: Database,
  sessionId: string,
  userId: string,
  mime: string,
  ext: string,
): Promise<LiveRecording> {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await ensureLiveDir(sessionId);
  const [row] = await db
    .insert(schema.liveRecordings)
    .values({ id, sessionId, file: `rec-${id}.${ext}`, mime, createdBy: userId })
    .returning();
  return toRecording(row);
}

export async function getRecordingRow(db: Database, sessionId: string, recordingId: string): Promise<RecordingRow> {
  const row = await db.query.liveRecordings.findFirst({
    where: and(eq(schema.liveRecordings.id, recordingId), eq(schema.liveRecordings.sessionId, sessionId)),
  });
  if (!row) throw notFound("Yozuv topilmadi.");
  return row;
}

export async function updateRecordingSize(db: Database, recordingId: string, bytes: number, seconds: number): Promise<void> {
  await db.update(schema.liveRecordings).set({ bytes, seconds }).where(eq(schema.liveRecordings.id, recordingId));
}

export async function deleteRecording(db: Database, sessionId: string, recordingId: string): Promise<void> {
  const row = await getRecordingRow(db, sessionId, recordingId);
  await db.delete(schema.liveRecordings).where(eq(schema.liveRecordings.id, row.id));
  await rm(path.join(liveDir(sessionId), row.file), { force: true });
}

// ── Ishlov berilgan audio («O'tgan suhbatlar») ──────────────────────

export async function setArchive(
  db: Database,
  id: string,
  meta: { file: string; mime: string; bytes: number; seconds: number } | null,
): Promise<LiveSession> {
  await db
    .update(schema.liveSessions)
    .set(meta
      ? { archiveFile: meta.file, archiveMime: meta.mime, archiveBytes: meta.bytes, archiveSeconds: meta.seconds, archivedAt: new Date().toISOString() }
      : { archiveFile: null, archiveMime: null, archiveBytes: 0, archiveSeconds: 0, archivedAt: null })
    .where(eq(schema.liveSessions.id, id));
  const session = await getLiveSession(db, id, true);
  if (!session) throw notFound("Suhbat topilmadi.");
  return session;
}

/**
 * Suhbatni o'zgartirish. Tugagan suhbat o'zgarmaydi; jonli suhbatning vaqti ham
 * o'zgarmaydi (u allaqachon boshlangan) — faqat sarlavha/kitob nomi.
 */
export async function updateLiveSession(
  db: Database,
  id: string,
  patch: { bookTitle?: string; title?: string; scheduledAt?: string },
): Promise<LiveSession> {
  const row = await db.query.liveSessions.findFirst({ where: eq(schema.liveSessions.id, id) });
  if (!row) throw notFound("Suhbat topilmadi.");
  if (row.status === "ended") throw badRequest("Tugagan suhbatni o'zgartirib bo'lmaydi.");
  if (patch.scheduledAt && row.status !== "planned") throw badRequest("Boshlangan suhbatning vaqtini o'zgartirib bo'lmaydi.");
  const set: Partial<SessionRow> = {};
  if (patch.bookTitle !== undefined) set.bookTitle = patch.bookTitle;
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.scheduledAt !== undefined) set.scheduledAt = patch.scheduledAt;
  await db.update(schema.liveSessions).set(set).where(eq(schema.liveSessions.id, id));
  return (await getLiveSession(db, id, true))!;
}

// Ruxsat chaqiruvchida (WS) tekshiriladi: faqat admin boshlaydi va tugatadi.
export async function startLiveSession(db: Database, id: string): Promise<string> {
  const startedAt = new Date().toISOString();
  await db
    .update(schema.liveSessions)
    .set({ status: "live", startedAt })
    .where(eq(schema.liveSessions.id, id));
  return startedAt;
}

export async function endLiveSession(db: Database, id: string): Promise<string> {
  const endedAt = new Date().toISOString();
  await db
    .update(schema.liveSessions)
    .set({ status: "ended", endedAt, recordingBy: null })
    .where(eq(schema.liveSessions.id, id));
  return endedAt;
}

// ── Qatnashchilar ───────────────────────────────────────────────────

export async function joinSession(
  db: Database,
  sessionId: string,
  userId: string,
  name: string,
  role: LiveRole = "listener",
): Promise<LiveParticipant> {
  await ensureUser(db, userId, name);
  await db
    .insert(schema.liveParticipants)
    .values({ sessionId, userId, name, role })
    .onConflictDoUpdate({
      target: [schema.liveParticipants.sessionId, schema.liveParticipants.userId],
      set: { name, role, handRaised: false, joinedAt: sql`CURRENT_TIMESTAMP` },
    });
  return { userId, name, role, handRaised: false };
}

export async function leaveSession(
  db: Database,
  sessionId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(schema.liveParticipants)
    .where(
      and(
        eq(schema.liveParticipants.sessionId, sessionId),
        eq(schema.liveParticipants.userId, userId),
      ),
    );
}

export async function clearAllParticipants(db: Database): Promise<void> {
  await db.delete(schema.liveParticipants);
  // Server qayta ishga tushsa, yozayotgan brauzer ham uzilgan bo'ladi.
  await db.update(schema.liveSessions).set({ recordingBy: null });
}

export async function getParticipants(
  db: Database,
  sessionId: string,
): Promise<LiveParticipant[]> {
  const rows = await db.query.liveParticipants.findMany({
    where: eq(schema.liveParticipants.sessionId, sessionId),
  });
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    role: r.role as LiveRole,
    handRaised: r.handRaised,
  }));
}

export async function setHandRaised(
  db: Database,
  sessionId: string,
  userId: string,
  raised: boolean,
): Promise<void> {
  await db
    .update(schema.liveParticipants)
    .set({ handRaised: raised })
    .where(
      and(
        eq(schema.liveParticipants.sessionId, sessionId),
        eq(schema.liveParticipants.userId, userId),
      ),
    );
}

export async function setRole(
  db: Database,
  sessionId: string,
  targetUserId: string,
  role: LiveRole,
): Promise<void> {
  await db
    .update(schema.liveParticipants)
    .set({ role, handRaised: false })
    .where(
      and(
        eq(schema.liveParticipants.sessionId, sessionId),
        eq(schema.liveParticipants.userId, targetUserId),
      ),
    );
}

// ── Xabarlar ────────────────────────────────────────────────────────

export async function addMessage(
  db: Database,
  sessionId: string,
  userId: string,
  userName: string,
  body: string,
): Promise<LiveMessage> {
  const result = await db.insert(schema.liveMessages).values({
    sessionId,
    userId,
    userName,
    body,
  }).returning();
  const row = result[0];
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    body: row.body,
    createdAt: sqliteUtcToIso(row.createdAt),
  };
}

export async function deleteMessage(
  db: Database,
  sessionId: string,
  messageId: number,
): Promise<boolean> {
  const deleted = await db
    .delete(schema.liveMessages)
    .where(and(eq(schema.liveMessages.id, messageId), eq(schema.liveMessages.sessionId, sessionId)))
    .returning({ id: schema.liveMessages.id });
  return deleted.length > 0;
}

export async function getRecentMessages(
  db: Database,
  sessionId: string,
  limit = 50,
): Promise<LiveMessage[]> {
  const rows = await db.query.liveMessages.findMany({
    where: eq(schema.liveMessages.sessionId, sessionId),
    orderBy: desc(schema.liveMessages.id),
    limit,
  });
  return rows.reverse().map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    body: r.body,
    createdAt: sqliteUtcToIso(r.createdAt),
  }));
}

// SQLite CURRENT_TIMESTAMP is UTC but lacks a zone marker, so browsers would parse it as local time.
function sqliteUtcToIso(value: string): string {
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

export async function getParticipantCount(
  db: Database,
  sessionId: string,
): Promise<number> {
  const result = await db
    .select({ c: sql<number>`count(*)` })
    .from(schema.liveParticipants)
    .where(eq(schema.liveParticipants.sessionId, sessionId));
  return result[0]?.c ?? 0;
}

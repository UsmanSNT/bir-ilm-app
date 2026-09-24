/**
 * Jonli suhbat domen mantiqi.
 *
 * HTTP va WebSocket'dan mustaqil — ikkalasi ham shu funksiyalarni chaqiradi.
 */
import { eq, and, desc, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ensureUser } from "./social";
import type {
  CreateLiveSessionInput,
  LiveSession,
  LiveParticipant,
  LiveMessage,
  LiveRole,
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

export async function getLiveSession(
  db: Database,
  id: string,
): Promise<LiveSession | null> {
  const row = await db.query.liveSessions.findFirst({
    where: eq(schema.liveSessions.id, id),
  });
  if (!row) return null;
  const count = await db
    .select({ c: sql<number>`count(*)` })
    .from(schema.liveParticipants)
    .where(eq(schema.liveParticipants.sessionId, id));
  return { ...row, participantCount: count[0]?.c ?? 0 };
}

export async function listLiveSessions(
  db: Database,
): Promise<LiveSession[]> {
  const rows = await db.query.liveSessions.findMany({
    orderBy: desc(schema.liveSessions.scheduledAt),
    limit: 20,
  });
  // Participant counts
  const counts = await db
    .select({
      sessionId: schema.liveParticipants.sessionId,
      c: sql<number>`count(*)`,
    })
    .from(schema.liveParticipants)
    .groupBy(schema.liveParticipants.sessionId);
  const countMap = new Map(counts.map((r) => [r.sessionId, r.c]));
  return rows.map((r) => ({ ...r, participantCount: countMap.get(r.id) ?? 0 }));
}

export async function startLiveSession(
  db: Database,
  id: string,
  moderatorId: string,
): Promise<void> {
  await db
    .update(schema.liveSessions)
    .set({ status: "live", startedAt: new Date().toISOString() })
    .where(and(eq(schema.liveSessions.id, id), eq(schema.liveSessions.moderatorId, moderatorId)));
}

export async function endLiveSession(
  db: Database,
  id: string,
  moderatorId: string,
): Promise<void> {
  await db
    .update(schema.liveSessions)
    .set({ status: "ended", endedAt: new Date().toISOString() })
    .where(and(eq(schema.liveSessions.id, id), eq(schema.liveSessions.moderatorId, moderatorId)));
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
    createdAt: row.createdAt,
  };
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
    createdAt: r.createdAt,
  }));
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

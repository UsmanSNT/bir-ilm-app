/** Jonli suhbat shartnomasi — web, Android va iOS uchun. */
import { z } from "zod";

export const LIVE_SESSION_STATUSES = ["planned", "live", "ended"] as const;
export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number];

export const LIVE_ROLES = ["listener", "speaker", "moderator"] as const;
export type LiveRole = (typeof LIVE_ROLES)[number];

export const LIMITS_LIVE = {
  title: 200,
  messageBody: 500,
} as const;

const trimmed = (max: number) => z.string().trim().max(max);

export const createLiveSessionSchema = z.object({
  bookTitle: trimmed(160).min(1, "Kitob nomini yozing."),
  title: trimmed(LIMITS_LIVE.title).min(1, "Sarlavhani yozing."),
  scheduledAt: z.string().datetime({ message: "ISO 8601 format kerak." }),
});

export const liveMessageSchema = z.object({
  body: trimmed(LIMITS_LIVE.messageBody).min(1, "Xabarni yozing."),
});

export type CreateLiveSessionInput = z.infer<typeof createLiveSessionSchema>;
export type LiveMessageInput = z.infer<typeof liveMessageSchema>;

export type LiveSession = {
  id: string;
  bookTitle: string;
  title: string;
  status: LiveSessionStatus;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  moderatorId: string;
  participantCount: number;
};

export type LiveParticipant = {
  userId: string;
  name: string;
  role: LiveRole;
  handRaised: boolean;
};

export type LiveMessage = {
  id: number;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
};

// ── WebSocket xabar tiplari ─────────────────────────────────────────

/** Mijozdan serverga. */
export type WsClientMessage =
  | { type: "join"; sessionId: string; token: string }
  | { type: "leave" }
  | { type: "chat"; body: string }
  | { type: "hand"; raised: boolean }
  | { type: "mod:grant_speaker"; targetUserId: string }
  | { type: "mod:revoke_speaker"; targetUserId: string }
  | { type: "mod:start" }
  | { type: "mod:end" };

/** Serverdan mijozga. */
export type WsServerMessage =
  | { type: "joined"; session: LiveSession; participants: LiveParticipant[]; recentMessages: LiveMessage[] }
  | { type: "error"; message: string }
  | { type: "participant_joined"; participant: LiveParticipant; count: number }
  | { type: "participant_left"; userId: string; count: number }
  | { type: "chat"; message: LiveMessage }
  | { type: "hand_update"; userId: string; raised: boolean }
  | { type: "role_update"; userId: string; role: LiveRole }
  | { type: "session_started"; startedAt: string }
  | { type: "session_ended"; endedAt: string };

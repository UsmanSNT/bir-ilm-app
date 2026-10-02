export const TALK_REACTIONS = ["❤️", "👏", "💡", "📚", "🔥", "🤲"] as const;
export type TalkRole = "host" | "speaker" | "listener";
export type TalkStatus = "scheduled" | "live" | "ended";
export type MediaKind = "audio" | "video" | "screen";
/** audio/video/screen — SFU'ga e'lon qilingan treklar; mic — mikrofon yoqiqmi (mute emas). */
export type TalkParticipant = { userId: string; name: string; role: TalkRole; hand: boolean; mic: boolean; audio: boolean; video: boolean; screen: boolean };
export type TalkMessage = { id: number; userId: string | null; name: string; kind: "text" | "reaction" | "system"; body: string; createdAt: string };
export type TalkState = {
  /** recording: 0 — yo'q, 1 — yozilmoqda, 2 — pauza. */
  room: { id: string; title: string; book: string; startsAt: string; status: TalkStatus; hostId: string | null; recording: 0 | 1 | 2 };
  me: { userId: string; authed: boolean; joined: boolean; role: TalkRole | null; hand: boolean; canStart: boolean };
  /** Ovoz/video serveri (SFU) sozlanganmi. */
  media: boolean;
  participants: TalkParticipant[];
  messages: TalkMessage[];
};

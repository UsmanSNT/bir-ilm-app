export const TALK_REACTIONS = ["❤️", "👏", "💡", "📚", "🔥", "🤲"] as const;
export type TalkRole = "host" | "speaker" | "listener";
export type TalkStatus = "scheduled" | "live" | "ended";
export type TalkParticipant = { userId: string; name: string; role: TalkRole; hand: boolean };
export type TalkMessage = { id: number; userId: string | null; name: string; kind: "text" | "reaction" | "system"; body: string; createdAt: string };
export type TalkState = {
  room: { id: string; title: string; book: string; startsAt: string; status: TalkStatus; hostId: string | null };
  me: { userId: string; authed: boolean; joined: boolean; role: TalkRole | null; hand: boolean };
  participants: TalkParticipant[];
  messages: TalkMessage[];
};

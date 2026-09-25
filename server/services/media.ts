/**
 * Ovoz, video va ekran uzatish — LiveKit media-serveri orqali.
 *
 * Faqat WebSocket serveri ishlatadi. Sozlamalar muhit o'zgaruvchilaridan:
 *   LIVEKIT_URL         — brauzer ulanadigan manzil (masalan wss://domen/livekit)
 *   LIVEKIT_API_KEY     — LiveKit kaliti
 *   LIVEKIT_API_SECRET  — LiveKit maxfiy kaliti
 *   LIVEKIT_HOST        — server API manzili (standart: http://127.0.0.1:7880)
 * Kalitlar berilmasa, media o'chiq bo'ladi va suhbat faqat chat bilan ishlaydi.
 */
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import type { LiveMedia, LiveRole } from "@/shared/contract/live";

type MediaConfig = { url: string; key: string; secret: string; host: string };

function readConfig(): MediaConfig | null {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_HOST } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  return {
    url: LIVEKIT_URL,
    key: LIVEKIT_API_KEY,
    secret: LIVEKIT_API_SECRET,
    host: LIVEKIT_HOST || "http://127.0.0.1:7880",
  };
}

const config = readConfig();
const rooms = config ? new RoomServiceClient(config.host, config.key, config.secret) : null;

export const mediaEnabled = config !== null;

const PUBLISH_SOURCES = [
  TrackSource.MICROPHONE,
  TrackSource.CAMERA,
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
];

// Tinglovchi faqat eshitadi va ko'radi; mikrofon, kamera va ekran so'z berilgandan keyin ochiladi.
function permissionFor(role: LiveRole) {
  const canPublish = role !== "listener";
  return {
    canSubscribe: true,
    canPublish,
    canPublishData: false,
    canPublishSources: canPublish ? PUBLISH_SOURCES : [],
  };
}

export async function issueMediaToken(
  sessionId: string,
  userId: string,
  name: string,
  role: LiveRole,
): Promise<LiveMedia | null> {
  if (!config) return null;
  const token = new AccessToken(config.key, config.secret, { identity: userId, name, ttl: "6h" });
  token.addGrant({ roomJoin: true, room: sessionId, ...permissionFor(role) });
  return { url: config.url, token: await token.toJwt() };
}

// LiveKit xonasi hali ochilmagan bo'lishi mumkin (qatnashchi media'ga ulanmagan) — bu xato emas.
async function quietly(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/not.?found|does not exist/i.test(message)) console.error("[media]", message);
  }
}

export function syncMediaRole(sessionId: string, userId: string, role: LiveRole) {
  if (!rooms) return Promise.resolve();
  return quietly(() => rooms.updateParticipant(sessionId, userId, undefined, permissionFor(role)));
}

export function removeFromMedia(sessionId: string, userId: string) {
  if (!rooms) return Promise.resolve();
  return quietly(() => rooms.removeParticipant(sessionId, userId));
}

export function closeMediaRoom(sessionId: string) {
  if (!rooms) return Promise.resolve();
  return quietly(() => rooms.deleteRoom(sessionId));
}

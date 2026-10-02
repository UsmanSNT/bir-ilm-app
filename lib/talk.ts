import { env } from "cloudflare:workers";
import { activeBookId, books } from "@/app/app-data";
import type { TalkState } from "@/app/talk-types";

/** Joriy xona: Toshkent vaqti bilan shu haftaning yakshanbasi 18:00 (UTC+5 → 13:00 UTC). */
function currentRoom(now = new Date()) {
  const tashkent = new Date(now.getTime() + 5 * 3600_000);
  const sunday = new Date(Date.UTC(tashkent.getUTCFullYear(), tashkent.getUTCMonth(), tashkent.getUTCDate() + ((7 - tashkent.getUTCDay()) % 7)));
  const id = sunday.toISOString().slice(0, 10);
  const book = books.find(b => b.id === activeBookId) ?? books[0];
  return { id, title: `${book.title} — birga tahlil qilamiz`, book: book.title, startsAt: `${id}T13:00:00.000Z` };
}

export async function ensureRoom(db: D1Database) {
  const r = currentRoom();
  await db.prepare("INSERT OR IGNORE INTO talk_rooms (id, title, book, starts_at) VALUES (?,?,?,?)").bind(r.id, r.title, r.book, r.startsAt).run();
  return (await db.prepare("SELECT id, title, book, starts_at AS startsAt, status, host_id AS hostId, recording FROM talk_rooms WHERE id=?").bind(r.id).first<TalkState["room"]>())!;
}

/** Efirni boshlash huquqi: TALK_ADMINS (vergul bilan loginlar) berilgan bo'lsa faqat ular, aks holda istalgan hisob. */
export function canStartTalk(login: string | null) {
  const admins = (env.TALK_ADMINS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return admins.length === 0 || (!!login && admins.includes(login.toLowerCase()));
}


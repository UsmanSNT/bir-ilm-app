/** Chatdagi rasm: faqat xaridorning o'zi va admin ko'radi. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveIdentity } from "@/server/auth/identity";
import { tryGetDb } from "@/server/db/client";
import { getUserRole } from "@/server/services/roles";
import { CHAT_FILE_PATTERN, CHAT_USER_PATTERN, chatDir } from "@/server/services/store-chat";

type Segment = { params: Promise<Record<string, string | string[]>> };

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const notFound = () => new Response("Topilmadi", { status: 404 });

export async function GET(request: Request, segment: Segment) {
  const params = await segment.params;
  const uid = String(params.uid);
  const file = String(params.file);
  if (!CHAT_USER_PATTERN.test(uid) || !CHAT_FILE_PATTERN.test(file)) return notFound();

  const db = await tryGetDb();
  if (!db) return notFound();
  const { userId } = await resolveIdentity(request);
  if (userId !== uid && (await getUserRole(db, userId)) !== "admin") return notFound();

  const bytes = await readFile(path.join(chatDir(uid), file)).catch(() => null);
  if (!bytes) return notFound();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

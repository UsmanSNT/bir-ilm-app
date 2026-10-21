/** Profil rasmlari (avatar, orqa fon): ochiq, fayl nomi tasodifiy va o'zgarmas. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PROFILE_FILE, profileDir } from "@/server/services/profile-media";

type Segment = { params: Promise<Record<string, string | string[]>> };

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(_request: Request, segment: Segment) {
  const file = String((await segment.params).file);
  const bytes = PROFILE_FILE.test(file) ? await readFile(path.join(profileDir(), file)).catch(() => null) : null;
  if (!bytes) return new Response("Topilmadi", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}

/**
 * Profil rasmi: `POST ?kind=avatar|cover` (xom tana, Content-Type = image/jpeg|png|webp), `DELETE ?kind=...`.
 */
import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { clearProfileImage, PROFILE_IMAGE_KINDS, setProfileImage } from "@/server/services/profile-media";

export const runtime = "edge";

const querySchema = z.object({ kind: z.enum(PROFILE_IMAGE_KINDS) });
type Query = z.infer<typeof querySchema>;

export const POST = defineRoute<Query, { url: string }>({
  schema: querySchema,
  source: "query",
  status: 201,
  handler: async ({ db, identity, input, request }) => {
    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    return { url: await setProfileImage(db, identity.userId, input.kind, mime, new Uint8Array(await request.arrayBuffer())) };
  },
});

export const DELETE = defineRoute<Query, { removed: true }>({
  schema: querySchema,
  source: "query",
  handler: async ({ db, identity, input }) => {
    await clearProfileImage(db, identity.userId, input.kind);
    return { removed: true };
  },
});

export const OPTIONS = POST;

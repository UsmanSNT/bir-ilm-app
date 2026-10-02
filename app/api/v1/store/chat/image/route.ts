/** Xaridor rasm yuboradi (to'lov cheki): xom tana, Content-Type = image/jpeg|png|webp. */
import { defineRoute } from "@/server/http/handler";
import { sendImage } from "@/server/services/store-chat";
import type { StoreMessage } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<undefined, StoreMessage>({
  status: 201,
  handler: async ({ db, identity, request }) => {
    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    return sendImage(db, identity.userId, "user", identity.userId, mime, new Uint8Array(await request.arrayBuffer()));
  },
});

export const OPTIONS = POST;

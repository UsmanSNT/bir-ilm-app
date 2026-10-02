/** Admin xaridorga rasm yuboradi (masalan, kitob rasmi): xom tana, Content-Type = image/*. */
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { sendImage } from "@/server/services/store-chat";
import type { StoreMessage } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<undefined, StoreMessage>({
  status: 201,
  handler: async ({ db, identity, request, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Rasmni faqat admin yuboradi.");
    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    return sendImage(db, identity.userId, "admin", params.userId, mime, new Uint8Array(await request.arrayBuffer()));
  },
});

export const OPTIONS = POST;

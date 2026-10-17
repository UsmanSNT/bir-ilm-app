/** Admin xaridorga rasm yuboradi (masalan, kitob rasmi yoki hisob raqam): xom tana, Content-Type = image/*. `?order=` — buyurtma yozishmasi. */
import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { sendImage } from "@/server/services/store-chat";
import type { StoreMessage } from "@/shared/contract";

export const runtime = "edge";

const querySchema = z.object({ order: z.string().trim().min(1).max(64).optional() });
type Query = z.infer<typeof querySchema>;

export const POST = defineRoute<Query, StoreMessage>({
  schema: querySchema,
  source: "query",
  status: 201,
  handler: async ({ db, identity, request, params, input }) => {
    await requireRole(db, identity.userId, ["admin"], "Rasmni faqat admin yuboradi.");
    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    return sendImage(db, identity.userId, "admin", params.userId, mime, new Uint8Array(await request.arrayBuffer()), "", input.order ?? null);
  },
});

export const OPTIONS = POST;

/** Admin: bitta xaridor yozishmasi — o'qish (GET ?after=<id>) va javob yozish (POST). */
import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { getThreadForAdmin, sendAdminMessage } from "@/server/services/store-chat";
import { storeMessageSchema, type AdminStoreChat, type StoreMessage } from "@/shared/contract";

export const runtime = "edge";

const querySchema = z.object({ after: z.coerce.number().int().min(0).default(0) });
type Query = z.infer<typeof querySchema>;
const replySchema = storeMessageSchema.pick({ body: true });
type Reply = z.infer<typeof replySchema>;

export const GET = defineRoute<Query, AdminStoreChat>({
  schema: querySchema,
  source: "query",
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Do'kon yozishmalarini faqat admin ko'radi.");
    return getThreadForAdmin(db, params.userId, input.after);
  },
});

export const POST = defineRoute<Reply, StoreMessage>({
  schema: replySchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Javobni faqat admin yozadi.");
    return sendAdminMessage(db, identity.userId, params.userId, input.body);
  },
});

export const OPTIONS = GET;

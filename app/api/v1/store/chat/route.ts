/** Xaridorning admin bilan yozishmasi: o'qish (GET ?after=<id>) va xabar yuborish (POST). */
import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { getUserChat, sendUserMessage } from "@/server/services/store-chat";
import { storeMessageSchema, type StoreChat, type StoreMessage, type StoreMessageInput } from "@/shared/contract";

export const runtime = "edge";

const querySchema = z.object({ after: z.coerce.number().int().min(0).default(0) });
type Query = z.infer<typeof querySchema>;

export const GET = defineRoute<Query, StoreChat>({
  schema: querySchema,
  source: "query",
  handler: async ({ db, identity, input }) => getUserChat(db, identity.userId, input.after),
});

export const POST = defineRoute<StoreMessageInput, StoreMessage>({
  schema: storeMessageSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input }) => sendUserMessage(db, identity.userId, input),
});

export const OPTIONS = GET;

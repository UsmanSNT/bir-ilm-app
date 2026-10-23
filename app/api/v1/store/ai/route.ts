/** Book Store AI yordamchisi: kitob tavsiyasi, mutolaa rejasi, qisqa xulosa. */
import { defineRoute } from "@/server/http/handler";
import { askStoreAi } from "@/server/services/store-ai";
import { storeAiSchema, type StoreAiInput } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<StoreAiInput, { text: string }>({
  schema: storeAiSchema,
  source: "body",
  handler: async ({ db, identity, input }) => askStoreAi(db, identity.userId, input),
});

export const OPTIONS = POST;

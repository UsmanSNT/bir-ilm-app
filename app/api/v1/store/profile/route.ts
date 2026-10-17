/** Do'kon hisobining yetkazib berish ma'lumotlari: o'qish (GET) va saqlash (PUT). */
import { defineRoute } from "@/server/http/handler";
import { getStoreProfile, saveStoreProfile } from "@/server/services/store";
import { storeProfileSchema, type StoreProfile } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, StoreProfile>({
  handler: async ({ db, identity }) => getStoreProfile(db, identity.userId),
});

export const PUT = defineRoute<StoreProfile, StoreProfile>({
  schema: storeProfileSchema,
  source: "body",
  handler: async ({ db, identity, input }) => saveStoreProfile(db, identity.userId, input),
});

export const OPTIONS = GET;

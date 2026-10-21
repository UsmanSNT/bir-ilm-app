/** Xaridorning yozishmalari: «Umumiy savollar» va har bir buyurtma alohida, o'qilmaganlar soni bilan. */
import { defineRoute } from "@/server/http/handler";
import { getUserInbox } from "@/server/services/store-chat";
import type { StoreInbox } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, StoreInbox>({
  handler: async ({ db, identity }) => getUserInbox(db, identity.userId),
});

export const OPTIONS = GET;

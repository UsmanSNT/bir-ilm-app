/** Ochilgan bildirishnomalarni o'chiradi (`ids`) yoki hammasini (`all: true`). */
import { defineRoute } from "@/server/http/handler";
import { markNotificationsRead } from "@/server/services/notifications";
import { markNotificationsReadSchema, type MarkNotificationsReadInput } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<MarkNotificationsReadInput, { unread: number }>({
  schema: markNotificationsReadSchema,
  source: "body",
  handler: ({ db, identity, input }) => markNotificationsRead(db, identity.userId, input),
});

export const OPTIONS = POST;

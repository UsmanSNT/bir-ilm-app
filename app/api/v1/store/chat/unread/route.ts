/** Xaridorning o'qilmagan admin javoblari soni (xabarlarni o'qilgan qilmaydi). */
import { defineRoute } from "@/server/http/handler";
import { userUnreadCount } from "@/server/services/store-chat";

export const runtime = "edge";

export const GET = defineRoute<undefined, { unread: number }>({
  handler: async ({ db, identity }) => ({ unread: await userUnreadCount(db, identity.userId) }),
});

export const OPTIONS = GET;

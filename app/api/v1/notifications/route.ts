/** Qo'ng'iroqcha: o'qilmagan shaxsiy bildirishnomalar (reaksiya, izoh, izohga javob). */
import { defineRoute } from "@/server/http/handler";
import { listNotifications } from "@/server/services/notifications";
import type { NotificationInbox } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, NotificationInbox>({
  handler: ({ db, identity }) => listNotifications(db, identity.userId),
});

export const OPTIONS = GET;

/** Admin: do'kon yozishmalari ro'yxati va o'qilmaganlar soni. */
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { adminUnreadTotal, listThreads } from "@/server/services/store-chat";
import type { StoreThread } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, { items: StoreThread[]; unread: number }>({
  handler: async ({ db, identity }) => {
    await requireRole(db, identity.userId, ["admin"], "Do'kon yozishmalarini faqat admin ko'radi.");
    const [items, unread] = await Promise.all([listThreads(db), adminUnreadTotal(db)]);
    return { items, unread };
  },
});

export const OPTIONS = GET;

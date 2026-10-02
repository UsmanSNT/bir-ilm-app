/** Videoni ro'yxatdan olib tashlash (faqat admin). */
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { deleteVideo } from "@/server/services/site";
import type { Empty } from "@/shared/contract";

export const runtime = "edge";

export const DELETE = defineRoute<undefined, Empty>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Videoni faqat admin o'chiradi.");
    await deleteVideo(db, params.id);
    return {} as Empty;
  },
});

export const OPTIONS = DELETE;

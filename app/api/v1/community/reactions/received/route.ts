/** Faollik → Reaksiyalar: boshqalar postlaringizga bildirgan reaksiyalar. */
import { defineRoute } from "@/server/http/handler";
import { listReceivedReactions } from "@/server/services/notifications";
import type { ReceivedReaction } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, ReceivedReaction[]>({
  handler: ({ db, identity }) => listReceivedReactions(db, identity.userId),
});

export const OPTIONS = GET;

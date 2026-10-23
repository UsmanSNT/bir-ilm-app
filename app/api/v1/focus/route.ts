/**
 * Fokus (Pomodoro) seanslari.
 *
 * `sessionId` — UUID. Ilova tarmoq uzilganda so'rovni qayta yuborishi mumkin,
 * shuning uchun bir xil `sessionId` ikkinchi marta hisoblanmaydi.
 */
import { defineRoute } from "@/server/http/handler";
import { getFocusSummary, recordFocusSession } from "@/server/services/social";
import { focusSessionSchema, type FocusSessionInput, type FocusSummary } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, FocusSummary>({
  handler: ({ db, identity }) => getFocusSummary(db, identity.userId),
});

export const POST = defineRoute<FocusSessionInput, FocusSummary>({
  schema: focusSessionSchema,
  source: "body",
  status: 201,
  handler: ({ db, identity, input }) => recordFocusSession(db, identity.userId, input),
});

export const OPTIONS = GET;

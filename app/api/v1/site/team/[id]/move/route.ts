/** Saytdagi tartibni o'zgartirish: `{ direction: "up" | "down" }` (faqat admin). */
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { moveTeamMember } from "@/server/services/team";
import { teamMoveSchema, type TeamMember, type TeamMoveInput } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<TeamMoveInput, { items: TeamMember[] }>({
  schema: teamMoveSchema,
  source: "body",
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Jamoani faqat admin boshqaradi.");
    return { items: await moveTeamMember(db, params.id, input) };
  },
});

export const OPTIONS = POST;

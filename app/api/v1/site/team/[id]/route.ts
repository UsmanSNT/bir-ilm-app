/** Jamoa a'zosini tahrirlash va o'chirish (faqat admin). */
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { deleteTeamMember, updateTeamMember } from "@/server/services/team";
import { teamMemberInputSchema, type TeamMember, type TeamMemberData } from "@/shared/contract";

export const runtime = "edge";

const ADMIN_ONLY = "Jamoani faqat admin boshqaradi.";

export const PUT = defineRoute<TeamMemberData, { items: TeamMember[] }>({
  schema: teamMemberInputSchema,
  source: "body",
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin"], ADMIN_ONLY);
    return { items: await updateTeamMember(db, params.id, input) };
  },
});

export const DELETE = defineRoute<undefined, { items: TeamMember[] }>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, ["admin"], ADMIN_ONLY);
    return { items: await deleteTeamMember(db, params.id) };
  },
});

export const OPTIONS = PUT;

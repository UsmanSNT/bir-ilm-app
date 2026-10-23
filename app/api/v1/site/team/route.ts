/** Loyiha jamoasi: ro'yxat — hamma (ko'rinadiganlar), `?all=1` va qo'shish — faqat admin. */
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { createTeamMember, listTeam } from "@/server/services/team";
import {
  teamListQuerySchema,
  teamMemberInputSchema,
  type TeamListQuery,
  type TeamMember,
  type TeamMemberData,
} from "@/shared/contract";

export const runtime = "edge";

const ADMIN_ONLY = "Jamoani faqat admin boshqaradi.";

export const GET = defineRoute<TeamListQuery, { items: TeamMember[] }>({
  schema: teamListQuerySchema,
  source: "query",
  handler: async ({ db, identity, input }) => {
    if (input.all) await requireRole(db, identity.userId, ["admin"], ADMIN_ONLY);
    return { items: await listTeam(db, Boolean(input.all)) };
  },
});

export const POST = defineRoute<TeamMemberData, { items: TeamMember[] }>({
  schema: teamMemberInputSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input }) => {
    await requireRole(db, identity.userId, ["admin"], ADMIN_ONLY);
    return { items: await createTeamMember(db, identity.userId, input) };
  },
});

export const OPTIONS = GET;

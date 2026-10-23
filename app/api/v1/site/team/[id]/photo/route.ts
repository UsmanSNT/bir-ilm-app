/** Jamoa a'zosi rasmi: `POST` (xom tana, Content-Type = image/jpeg|png|webp), `DELETE` (faqat admin). */
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { clearTeamPhoto, setTeamPhoto } from "@/server/services/team";
import type { TeamMember } from "@/shared/contract";

export const runtime = "edge";

const ADMIN_ONLY = "Jamoani faqat admin boshqaradi.";

export const POST = defineRoute<undefined, { items: TeamMember[] }>({
  handler: async ({ db, identity, params, request }) => {
    await requireRole(db, identity.userId, ["admin"], ADMIN_ONLY);
    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    return { items: await setTeamPhoto(db, params.id, mime, new Uint8Array(await request.arrayBuffer())) };
  },
});

export const DELETE = defineRoute<undefined, { items: TeamMember[] }>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, ["admin"], ADMIN_ONLY);
    return { items: await clearTeamPhoto(db, params.id) };
  },
});

export const OPTIONS = POST;

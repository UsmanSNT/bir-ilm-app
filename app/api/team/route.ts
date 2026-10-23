import { env } from "cloudflare:workers";
import { TEAM_COLUMNS, toMember } from "@/lib/team";

export const runtime = "edge";

export async function GET() {
  try {
    if (!env.DB) throw new Error("DB unavailable");
    const { results } = await env.DB
      .prepare(`SELECT ${TEAM_COLUMNS} FROM team_members WHERE visible=1 ORDER BY sort_order ASC, created_at ASC`)
      .all<Parameters<typeof toMember>[0]>();
    return Response.json({ members: results.map(toMember) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Jamoa yuklanmadi." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

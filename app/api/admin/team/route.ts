import { env } from "cloudflare:workers";
import { checkAdmin } from "@/lib/admin";
import { TEAM_COLUMNS, TeamValidationError, parseTeamInput, toMember } from "@/lib/team";

export const runtime = "edge";

type Row = Parameters<typeof toMember>[0];
const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });

async function guard(request: Request, mutating: boolean) {
  if (mutating) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return fail("So'rov rad etildi.", 403);
  }
  const admin = await checkAdmin();
  if (!admin.ok) return fail(admin.error, admin.status);
  if (!env.DB) return fail("Ma'lumotlar bazasi mavjud emas.", 503);
  return null;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw: unknown = await request.json();
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function list() {
  const { results } = await env.DB!
    .prepare(`SELECT ${TEAM_COLUMNS} FROM team_members ORDER BY sort_order ASC, created_at ASC`)
    .all<Row>();
  return Response.json({ members: results.map(toMember) }, { headers });
}

export async function GET(request: Request) {
  const denied = await guard(request, false);
  if (denied) return denied;
  return list();
}

export async function POST(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const body = await readBody(request);
  if (!body) return fail("So'rov noto'g'ri.");
  try {
    const input = parseTeamInput(body);
    await env.DB!
      .prepare(
        `INSERT INTO team_members (id, name, role, bio, photo, telegram, instagram, visible, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM team_members))`,
      )
      .bind(crypto.randomUUID(), input.name, input.role, input.bio, input.photo, input.telegram, input.instagram, input.visible ? 1 : 0)
      .run();
    return list();
  } catch (error) {
    return error instanceof TeamValidationError ? fail(error.message) : fail("Saqlanmadi.", 500);
  }
}

export async function PUT(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const body = await readBody(request);
  if (!body || typeof body.id !== "string") return fail("So'rov noto'g'ri.");
  try {
    const input = parseTeamInput(body);
    const result = await env.DB!
      .prepare(
        `UPDATE team_members SET name=?, role=?, bio=?, photo=?, telegram=?, instagram=?, visible=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      )
      .bind(input.name, input.role, input.bio, input.photo, input.telegram, input.instagram, input.visible ? 1 : 0, body.id)
      .run();
    if (!result.meta.changes) return fail("A'zo topilmadi.", 404);
    return list();
  } catch (error) {
    return error instanceof TeamValidationError ? fail(error.message) : fail("Saqlanmadi.", 500);
  }
}

export async function DELETE(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return fail("So'rov noto'g'ri.");
  const result = await env.DB!.prepare("DELETE FROM team_members WHERE id=?").bind(id).run();
  if (!result.meta.changes) return fail("A'zo topilmadi.", 404);
  return list();
}

/** Tartibni o'zgartirish: { id, direction: "up" | "down" }. */
export async function PATCH(request: Request) {
  const denied = await guard(request, true);
  if (denied) return denied;
  const body = await readBody(request);
  if (!body || typeof body.id !== "string" || (body.direction !== "up" && body.direction !== "down")) {
    return fail("So'rov noto'g'ri.");
  }
  const db = env.DB!;
  const { results } = await db
    .prepare("SELECT id FROM team_members ORDER BY sort_order ASC, created_at ASC")
    .all<{ id: string }>();
  const ids = results.map((row) => row.id);
  const from = ids.indexOf(body.id);
  const to = body.direction === "up" ? from - 1 : from + 1;
  if (from === -1) return fail("A'zo topilmadi.", 404);
  if (to >= 0 && to < ids.length) {
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await db.batch(ids.map((id, index) => db.prepare("UPDATE team_members SET sort_order=? WHERE id=?").bind(index + 1, id)));
  }
  return list();
}

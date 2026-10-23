import { NO_STORE, adminGuard, jsonError as fail, readJsonObject } from "@/lib/admin";
import { TEAM_COLUMNS, TeamValidationError, parseTeamInput, toMember } from "@/lib/team";

export const runtime = "edge";

type Row = Parameters<typeof toMember>[0];

async function list(db: D1Database) {
  const { results } = await db
    .prepare(`SELECT ${TEAM_COLUMNS} FROM team_members ORDER BY sort_order ASC, created_at ASC`)
    .all<Row>();
  return Response.json({ members: results.map(toMember) }, { headers: NO_STORE });
}

export async function GET(request: Request) {
  const guard = await adminGuard(request, false);
  if ("denied" in guard) return guard.denied;
  return list(guard.db);
}

export async function POST(request: Request) {
  const guard = await adminGuard(request, true);
  if ("denied" in guard) return guard.denied;
  const body = await readJsonObject(request);
  if (!body) return fail("So'rov noto'g'ri.");
  try {
    const input = parseTeamInput(body);
    await guard.db
      .prepare(
        `INSERT INTO team_members (id, name, role, bio, photo, telegram, instagram, visible, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM team_members))`,
      )
      .bind(crypto.randomUUID(), input.name, input.role, input.bio, input.photo, input.telegram, input.instagram, input.visible ? 1 : 0)
      .run();
    return list(guard.db);
  } catch (error) {
    return error instanceof TeamValidationError ? fail(error.message) : fail("Saqlanmadi.", 500);
  }
}

export async function PUT(request: Request) {
  const guard = await adminGuard(request, true);
  if ("denied" in guard) return guard.denied;
  const body = await readJsonObject(request);
  if (!body || typeof body.id !== "string") return fail("So'rov noto'g'ri.");
  try {
    const input = parseTeamInput(body);
    const result = await guard.db
      .prepare(
        `UPDATE team_members SET name=?, role=?, bio=?, photo=?, telegram=?, instagram=?, visible=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      )
      .bind(input.name, input.role, input.bio, input.photo, input.telegram, input.instagram, input.visible ? 1 : 0, body.id)
      .run();
    if (!result.meta.changes) return fail("A'zo topilmadi.", 404);
    return list(guard.db);
  } catch (error) {
    return error instanceof TeamValidationError ? fail(error.message) : fail("Saqlanmadi.", 500);
  }
}

export async function DELETE(request: Request) {
  const guard = await adminGuard(request, true);
  if ("denied" in guard) return guard.denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return fail("So'rov noto'g'ri.");
  const result = await guard.db.prepare("DELETE FROM team_members WHERE id=?").bind(id).run();
  if (!result.meta.changes) return fail("A'zo topilmadi.", 404);
  return list(guard.db);
}

/** Tartibni o'zgartirish: { id, direction: "up" | "down" }. */
export async function PATCH(request: Request) {
  const guard = await adminGuard(request, true);
  if ("denied" in guard) return guard.denied;
  const body = await readJsonObject(request);
  if (!body || typeof body.id !== "string" || (body.direction !== "up" && body.direction !== "down")) {
    return fail("So'rov noto'g'ri.");
  }
  const { db } = guard;
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
  return list(db);
}

import { AboutValidationError, parseAboutInput } from "@/lib/about";
import { NO_STORE, adminGuard, jsonError as fail, readJsonObject } from "@/lib/admin";
import { loadAboutSettings, saveAboutSettings } from "@/lib/settings";

export const runtime = "edge";

export async function GET(request: Request) {
  const guard = await adminGuard(request, false);
  if ("denied" in guard) return guard.denied;
  return Response.json({ settings: await loadAboutSettings(guard.db) }, { headers: NO_STORE });
}

export async function PUT(request: Request) {
  const guard = await adminGuard(request, true);
  if ("denied" in guard) return guard.denied;
  const body = await readJsonObject(request);
  if (!body) return fail("So'rov noto'g'ri.");
  try {
    const settings = parseAboutInput(body);
    await saveAboutSettings(guard.db, settings);
    return Response.json({ settings }, { headers: NO_STORE });
  } catch (error) {
    return error instanceof AboutValidationError ? fail(error.message) : fail("Saqlanmadi.", 500);
  }
}

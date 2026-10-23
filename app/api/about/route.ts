import { env } from "cloudflare:workers";
import { DEFAULT_ABOUT } from "@/lib/about";
import { loadAboutSettings } from "@/lib/settings";

export const runtime = "edge";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (!env.DB) throw new Error("DB unavailable");
    return Response.json({ settings: await loadAboutSettings(env.DB) }, { headers });
  } catch {
    // Sahifa standart qiymatlar bilan ishlashda davom etadi.
    return Response.json({ settings: DEFAULT_ABOUT, fallback: true }, { headers });
  }
}

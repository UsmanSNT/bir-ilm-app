/**
 * Sog'liq tekshiruvi.
 *
 * Bu route ma'lumotlar bazasisiz ham javob beradi — serverga joylashtirishda
 * va mobil ilova ishga tushganda backend tayyorligini tekshirish uchun.
 */
import { corsHeaders, parseAllowedOrigins, preflightResponse } from "@/server/http/cors";
import { jsonOk } from "@/server/http/response";
import { tryGetDb } from "@/server/db/client";
import { API_VERSION } from "@/shared/contract";

export const runtime = "edge";

type Health = {
  status: "ok" | "degraded";
  version: typeof API_VERSION;
  database: "connected" | "unavailable";
  time: string;
};

function context(request: Request) {
  return {
    origin: request.headers.get("origin"),
    selfOrigin: new URL(request.url).origin,
    allowed: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  };
}

export async function GET(request: Request): Promise<Response> {
  const db = await tryGetDb();

  const body: Health = {
    status: db ? "ok" : "degraded",
    version: API_VERSION,
    database: db ? "connected" : "unavailable",
    time: new Date().toISOString(),
  };

  return jsonOk(body, { headers: corsHeaders(context(request)) });
}

export function OPTIONS(request: Request): Response {
  return preflightResponse(context(request));
}

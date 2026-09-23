/**
 * Route o'rovchisi (wrapper).
 *
 * Har bir `/api/v1/*` route shu yerdan o'tadi va quyidagilarni BEPUL oladi:
 *   - CORS + OPTIONS preflight (native ilovalar uchun)
 *   - yagona identifikatsiya (cookie yoki Bearer)
 *   - CSRF himoyasi (o'zgartiruvchi so'rovlar uchun origin tekshiruvi)
 *   - zod bilan validatsiya
 *   - xatolarni bitta konvertga o'girish
 */
import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import type { Identity } from "@/server/auth/identity";
import { resolveIdentity, sessionCookie } from "@/server/auth/identity";
import { DatabaseUnavailableError, tryGetDb, type Database } from "@/server/db/client";
import { corsHeaders, isAllowedOrigin, parseAllowedOrigins, preflightResponse } from "./cors";
import { ApiException, dbUnavailable, forbidden, badRequest, validationFailed } from "./errors";
import { exceptionToResponse, jsonOk } from "./response";

export type RequestContext<TInput = undefined> = {
  request: Request;
  db: Database;
  identity: Identity;
  /** Validatsiyadan o'tgan tana yoki so'rov parametrlari. */
  input: TInput;
  /** Dinamik yo'l segmentlari, masalan `/posts/[id]` uchun `{ id: "..." }`. */
  params: Record<string, string>;
};

/** Next.js route handler ikkinchi argumenti. */
type RouteSegment = { params: Promise<Record<string, string | string[]>> };

/**
 * Sxema chiqish tipini qat'iy belgilaydi, kirish tipini esa erkin qoldiradi:
 * "default" va "coerce" ishlatilganda kirish va chiqish tiplari bir xil emas.
 */
type AnyInputSchema<TOutput> = ZodType<TOutput, ZodTypeDef, unknown>;

export type RouteOptions<TInput, TOutput> = {
  /** Tanani (POST/PATCH) yoki URL parametrlarini (GET) tekshiradigan sxema. */
  schema?: AnyInputSchema<TInput>;
  /** GET bo'lsa sxema URL parametrlariga qo'llanadi. */
  source?: "body" | "query";
  handler: (context: RequestContext<TInput>) => Promise<TOutput>;
  /** Muvaffaqiyatli javob kodi. */
  status?: number;
};

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function defineRoute<TInput = undefined, TOutput = unknown>(
  options: RouteOptions<TInput, TOutput>,
) {
  return async (request: Request, segment?: RouteSegment): Promise<Response> => {
    const selfOrigin = new URL(request.url).origin;
    const origin = request.headers.get("origin");
    const allowed = parseAllowedOrigins(readEnv("ALLOWED_ORIGINS"));
    const cors = { origin, selfOrigin, allowed };

    if (request.method === "OPTIONS") return preflightResponse(cors);

    const headers = corsHeaders(cors);

    try {
      // CSRF: begona sayt cookie bilan yozuv qila olmasin. Native originlar
      // va o'z originimiz ruxsat etilgan ro'yxatda.
      if (MUTATING_METHODS.has(request.method) && !isAllowedOrigin(cors)) {
        throw forbidden("So'rov rad etildi.");
      }

      const identity = await resolveIdentity(request);

      // Yangi mehmon tokeni faqat webda cookie'ga yoziladi; native mijoz
      // tokenni `/api/v1/auth/session` orqali oladi va o'zi saqlaydi.
      if (identity.isNew && identity.platform === "web") {
        headers.append("Set-Cookie", sessionCookie(request, identity.token));
      }

      const db = await tryGetDb();
      if (!db) throw dbUnavailable();

      const input = options.schema
        ? await parseInput(request, options.schema, options.source ?? defaultSource(request))
        : (undefined as TInput);

      const params = await resolveParams(segment);
      const data = await options.handler({ request, db, identity, input, params });
      return jsonOk(data, { status: options.status ?? 200, headers });
    } catch (error) {
      return toErrorResponse(error, headers);
    }
  };
}

/** Next.js 16 da `params` — Promise. Massiv segmentlar birinchi qiymatga qisqartiriladi. */
async function resolveParams(segment?: RouteSegment): Promise<Record<string, string>> {
  if (!segment?.params) return {};

  const raw = await segment.params;
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    params[key] = Array.isArray(value) ? (value[0] ?? "") : value;
  }
  return params;
}

function defaultSource(request: Request): "body" | "query" {
  return request.method === "GET" || request.method === "DELETE" ? "query" : "body";
}

async function parseInput<TInput>(
  request: Request,
  schema: AnyInputSchema<TInput>,
  source: "body" | "query",
): Promise<TInput> {
  let raw: unknown;

  if (source === "query") {
    raw = Object.fromEntries(new URL(request.url).searchParams);
  } else {
    try {
      raw = await request.json();
    } catch {
      throw badRequest("JSON noto'g'ri.");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw badRequest("So'rov tanasi obyekt bo'lishi kerak.");
    }
  }

  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw validationFailed(flattenZodError(result.error));
}

function flattenZodError(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

function toErrorResponse(error: unknown, headers: Headers): Response {
  if (error instanceof ApiException) return exceptionToResponse(error, headers);
  if (error instanceof DatabaseUnavailableError) {
    return exceptionToResponse(dbUnavailable(), headers);
  }

  // Kutilmagan xato: ichki tafsilot mijozga chiqmasin, lekin logda qolsin.
  console.error("[api/v1] kutilmagan xato:", error);
  return exceptionToResponse(
    new ApiException("internal_error", "Kutilmagan xato. Keyinroq qayta urinib ko'ring.", 500),
    headers,
  );
}

function readEnv(key: string): string | undefined {
  try {
    return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
  } catch {
    return undefined;
  }
}

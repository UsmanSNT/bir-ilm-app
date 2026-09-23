/** Barcha v1 javoblari bitta konvertda: `{ ok, data }` yoki `{ ok, error }`. */
import type { ApiError, ApiResponse } from "@/shared/contract";
import { ApiException } from "./errors";

export function jsonOk<T>(data: T, init: { status?: number; headers?: Headers } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  // Foydalanuvchiga xos ma'lumot — hech qachon keshlanmasin.
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");

  const body: ApiResponse<T> = { ok: true, data };
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function jsonError(
  error: ApiError,
  init: { status?: number; headers?: Headers } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  const body: ApiResponse<never> = { ok: false, error };
  return new Response(JSON.stringify(body), { status: init.status ?? 400, headers });
}

export function exceptionToResponse(exception: ApiException, headers?: Headers): Response {
  return jsonError(
    { code: exception.code, message: exception.message, fields: exception.fields },
    { status: exception.status, headers },
  );
}

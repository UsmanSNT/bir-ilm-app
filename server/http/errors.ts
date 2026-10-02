/** Domen xatolari — HTTP kodlaridan mustaqil, xizmat qatlamida tashlanadi. */
import type { ErrorCode } from "@/shared/contract";

export class ApiException extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiException";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export const badRequest = (message = "So'rov noto'g'ri.") =>
  new ApiException("bad_request", message, 400);

export const validationFailed = (
  fields: Record<string, string[]>,
  message = "Ma'lumotlarni tekshirib qayta yuboring.",
) => new ApiException("validation_failed", message, 422, fields);

export const unauthorized = (message = "Avval tizimga kiring.") =>
  new ApiException("unauthorized", message, 401);

export const forbidden = (message = "Bu amalga ruxsat yo'q.") =>
  new ApiException("forbidden", message, 403);

export const notFound = (message = "Topilmadi.") =>
  new ApiException("not_found", message, 404);

export const dbUnavailable = (
  message = "Ma'lumotlar bazasi hozircha ulanmagan. Keyinroq urinib ko'ring.",
) => new ApiException("db_unavailable", message, 503);

export const internalError = (
  message = "Kutilmagan xato. Keyinroq qayta urinib ko'ring.",
) => new ApiException("internal_error", message, 500);

/**
 * Bo'laklab yuklash.
 *
 *   GET  → { received, total } — uzilgan yuklash qayerdan davom etishi
 *   PUT  + X-Upload-Offset, tana = bo'lak (8 MB gacha) → { done, received, media? }
 */
import { defineRoute } from "@/server/http/handler";
import { badRequest } from "@/server/http/errors";
import { appendUpload, uploadStatus } from "@/server/services/community";
import type { UploadProgress, UploadTicket } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, UploadTicket>({
  handler: ({ db, identity, params }) => uploadStatus(db, identity.userId, params.id ?? ""),
});

export const PUT = defineRoute<undefined, UploadProgress>({
  handler: async ({ db, identity, params, request }) => {
    const offset = Number(request.headers.get("x-upload-offset"));
    if (!Number.isInteger(offset) || offset < 0) throw badRequest("X-Upload-Offset noto'g'ri.");
    const chunk = new Uint8Array(await request.arrayBuffer());
    return appendUpload(db, identity.userId, params.id ?? "", offset, chunk);
  },
});

export const OPTIONS = GET;

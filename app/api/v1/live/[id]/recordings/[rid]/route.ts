/**
 * Xom yozuv: bo'lak qo'shish (PUT, faqat yozayotgan admin) va o'chirish (DELETE, admin).
 *
 *   PUT + X-Upload-Offset, X-Recording-Seconds → { received }
 * Bo'lak qayta yuborilsa (tarmoq uzilib, javob kelmagan bo'lsa) ikki marta yozilmaydi.
 */
import { appendFile, stat } from "node:fs/promises";
import path from "node:path";
import { defineRoute } from "@/server/http/handler";
import { ApiException, badRequest, forbidden } from "@/server/http/errors";
import { deleteRecording, getRecordingRow, liveDir, updateRecordingSize } from "@/server/services/live";
import { requireRole } from "@/server/services/roles";
import { LIMITS_LIVE, type Empty } from "@/shared/contract";

export const runtime = "edge";

export const PUT = defineRoute<undefined, { received: number }>({
  handler: async ({ db, identity, request, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Suhbatni faqat admin yozib oladi.");
    const row = await getRecordingRow(db, params.id, params.rid);
    if (row.createdBy !== identity.userId) throw forbidden("Bu yozuvni boshqa admin yozmoqda.");

    const file = path.join(liveDir(params.id), row.file);
    const size = await stat(file).then((s) => s.size, () => 0);
    const offset = Number(request.headers.get("x-upload-offset"));
    if (!Number.isInteger(offset) || offset < 0) throw badRequest("X-Upload-Offset noto'g'ri.");

    const chunk = new Uint8Array(await request.arrayBuffer());
    if (!chunk.length || chunk.length > LIMITS_LIVE.recordingChunkBytes) throw new ApiException("bad_request", "Bo'lak hajmi noto'g'ri.", 413);
    if (offset + chunk.length <= size) return { received: size }; // allaqachon qabul qilingan
    if (offset !== size) throw new ApiException("bad_request", "Bo'lak tartibi buzildi.", 409, { received: [String(size)] });
    if (size + chunk.length > LIMITS_LIVE.recordingBytes) throw new ApiException("bad_request", "Yozuv juda katta.", 413);

    await appendFile(file, chunk);
    const seconds = Math.max(row.seconds, Math.round(Number(request.headers.get("x-recording-seconds")) || 0));
    await updateRecordingSize(db, row.id, size + chunk.length, seconds);
    return { received: size + chunk.length };
  },
});

export const DELETE = defineRoute<undefined, Empty>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Yozuvni faqat admin o'chiradi.");
    await deleteRecording(db, params.id, params.rid);
    return {} as Empty;
  },
});

export const OPTIONS = PUT;

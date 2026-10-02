/**
 * Suhbatni yozib olish (faqat admin). Brauzer xonadagi ovozlarni bitta oqimga yig'ib,
 * har ~10 soniyada bo'lak yuboradi: avval POST bilan yozuv ochiladi, keyin
 * `recordings/[rid]` ga PUT bilan bo'laklar ketma-ket qo'shiladi.
 */
import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { badRequest, notFound } from "@/server/http/errors";
import { createRecording, getLiveSession } from "@/server/services/live";
import { requireRole } from "@/server/services/roles";
import type { LiveRecording } from "@/shared/contract";

export const runtime = "edge";

const RECORDING_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
};

const schema = z.object({ mime: z.string().max(80) });

export const POST = defineRoute<z.infer<typeof schema>, LiveRecording>({
  schema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Suhbatni faqat admin yozib oladi.");
    const session = await getLiveSession(db, params.id);
    if (!session) throw notFound("Suhbat topilmadi.");
    if (session.status !== "live") throw badRequest("Yozib olish faqat jonli suhbatda ishlaydi.");
    const mime = input.mime.toLowerCase().split(";")[0].trim();
    const ext = RECORDING_EXTENSIONS[mime];
    if (!ext) throw badRequest("Bu yozuv formati qo'llab-quvvatlanmaydi.");
    return createRecording(db, params.id, identity.userId, mime, ext);
  },
});

export const OPTIONS = POST;

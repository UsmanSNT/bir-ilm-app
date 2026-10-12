/** Viktorina muqovasi: xom tana (Content-Type = image/jpeg|png|webp). Javob: { url } — viktorinani saqlashda yuboriladi. */
import { defineRoute } from "@/server/http/handler";
import { saveQuizImage } from "@/server/services/quiz-media";

export const runtime = "edge";

export const POST = defineRoute<undefined, { url: string }>({
  status: 201,
  handler: async ({ db, identity, request }) => {
    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    return { url: await saveQuizImage(db, identity.userId, mime, new Uint8Array(await request.arrayBuffer())) };
  },
});

export const OPTIONS = POST;

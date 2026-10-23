/** Kitob xatcho‘plari va belgilari (faqat o'z belgilaringiz). */
import { defineRoute } from "@/server/http/handler";
import { addMark, listMarks } from "@/server/services/ebook-marks";
import { createEbookMarkSchema, type CreateEbookMarkInput, type EbookMark } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, { items: EbookMark[] }>({
  handler: async ({ db, identity, params }) => ({ items: await listMarks(db, identity.userId, params.id) }),
});

export const POST = defineRoute<CreateEbookMarkInput, EbookMark>({
  schema: createEbookMarkSchema,
  source: "body",
  status: 201,
  handler: ({ db, identity, input, params }) => addMark(db, identity.userId, params.id, input),
});

export const OPTIONS = GET;

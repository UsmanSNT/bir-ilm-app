/**
 * Kitob muhokamasi.
 *
 * Eski `/api/app-state` dan farqi: muallif identifikatori mijozdan emas,
 * SERVERDAGI sessiyadan olinadi — ya'ni boshqa odam nomidan yozib bo'lmaydi.
 */
import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { badRequest } from "@/server/http/errors";
import { createComment, listComments, resolveName } from "@/server/services/library";
import { LIBRARY_LIMITS, type BookComment } from "@/shared/contract";

export const runtime = "edge";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(60),
});

const bodySchema = z.object({
  body: z.string().trim().min(1, "Izoh matni kerak.").max(LIBRARY_LIMITS.commentBody),
  /** Ixtiyoriy: ko'rsatiladigan ism. Berilmasa saqlangan ism ishlatiladi. */
  name: z.string().trim().max(40).optional(),
});

type ListQuery = z.infer<typeof listQuerySchema>;
type CommentBody = z.infer<typeof bodySchema>;

export const GET = defineRoute<ListQuery, { items: BookComment[] }>({
  schema: listQuerySchema,
  source: "query",
  handler: async ({ db, input, params }) => {
    const bookId = params.id;
    if (!bookId) throw badRequest("Kitob identifikatori ko'rsatilmagan.");

    return { items: await listComments(db, bookId, input.limit) };
  },
});

export const POST = defineRoute<CommentBody, BookComment>({
  schema: bodySchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input, params }) => {
    const bookId = params.id;
    if (!bookId) throw badRequest("Kitob identifikatori ko'rsatilmagan.");

    const name = input.name || (await resolveName(db, identity.userId));
    return createComment(db, identity.userId, name, { bookId, body: input.body });
  },
});

export const OPTIONS = GET;

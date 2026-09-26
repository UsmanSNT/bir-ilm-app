/**
 * Post uchun rasm/video yuklashni boshlash (faqat ro'yxatdan o'tganlar).
 * Javobdagi `id` bilan fayl bo'laklab `PUT /api/v1/media/{id}` ga yuboriladi.
 */
import { defineRoute } from "@/server/http/handler";
import { createUpload } from "@/server/services/community";
import { createUploadSchema, type CreateUploadInput, type UploadTicket } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<CreateUploadInput, UploadTicket>({
  schema: createUploadSchema,
  source: "body",
  status: 201,
  handler: ({ db, identity, input }) => createUpload(db, identity.userId, input),
});

export const OPTIONS = POST;

/** Kitobxonlar ro'yxati — kashf qilish bo'limi uchun. */
import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { listFollowing, listReaders } from "@/server/services/social";
import type { ReaderProfile } from "@/shared/contract";

export const runtime = "edge";

const readersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

type ReadersQuery = z.infer<typeof readersQuerySchema>;

type ReadersResponse = {
  items: (ReaderProfile & { isFollowing: boolean })[];
};

export const GET = defineRoute<ReadersQuery, ReadersResponse>({
  schema: readersQuerySchema,
  source: "query",
  handler: async ({ db, identity, input }) => {
    const [readers, following] = await Promise.all([
      listReaders(db, input.limit),
      listFollowing(db, identity.userId),
    ]);

    return {
      items: readers
        // O'zini ro'yxatda ko'rsatmaymiz.
        .filter((reader) => reader.id !== identity.userId)
        .map((reader) => ({ ...reader, isFollowing: following.includes(reader.id) })),
    };
  },
});

export const OPTIONS = GET;

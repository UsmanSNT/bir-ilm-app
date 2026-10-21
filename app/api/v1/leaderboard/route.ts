/**
 * Reyting.
 *
 * Ballar SERVERDA hisoblanadi (`touchActivity`), shuning uchun mijoz o'z
 * ballini o'zi yozib yubora olmaydi.
 */
import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { getLeaderboard } from "@/server/services/library";
import type { LeaderboardEntry } from "@/shared/contract";

export const runtime = "edge";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

type Query = z.infer<typeof querySchema>;

type LeaderboardResponse = {
  items: LeaderboardEntry[];
  /** Ko'ruvchining o'rni (1 dan boshlab). Ro'yxatda bo'lmasa `null`. */
  viewerRank: number | null;
};

export const GET = defineRoute<Query, LeaderboardResponse>({
  schema: querySchema,
  source: "query",
  handler: async ({ db, identity, input }) => {
    const items = await getLeaderboard(db, input.limit);
    const index = items.findIndex((entry) => entry.id === identity.userId);

    return { items, viewerRank: index >= 0 ? index + 1 : null };
  },
});

export const OPTIONS = GET;

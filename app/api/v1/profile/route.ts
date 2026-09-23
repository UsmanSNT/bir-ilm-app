/**
 * Profil.
 *
 * `GET`   — o'z profili yoki `?userId=` orqali boshqa kitobxonniki.
 * `PATCH` — faqat o'z profilini tahrirlash (ism, bio).
 */
import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { notFound } from "@/server/http/errors";
import { countFollowers, getProfile, listFollowing, updateProfile } from "@/server/services/social";
import { getFocusSummary } from "@/server/services/social";
import {
  updateProfileSchema,
  type FocusSummary,
  type ReaderProfile,
  type UpdateProfileInput,
} from "@/shared/contract";

export const runtime = "edge";

const profileQuerySchema = z.object({
  userId: z.string().max(80).optional(),
});

type ProfileQuery = z.infer<typeof profileQuerySchema>;

type ProfileResponse = ReaderProfile & {
  /** Ko'ruvchining o'z profilimi? */
  isSelf: boolean;
  /** Ko'ruvchi bu kitobxonga obunami? */
  isFollowing: boolean;
  followers: number;
  /** Faqat o'z profilida to'ldiriladi. */
  focus: FocusSummary | null;
  following: string[];
};

export const GET = defineRoute<ProfileQuery, ProfileResponse>({
  schema: profileQuerySchema,
  source: "query",
  handler: async ({ db, identity, input }) => {
    const targetId = input.userId ?? identity.userId;
    const isSelf = targetId === identity.userId;

    const profile = await getProfile(db, targetId);
    if (!profile) throw notFound("Kitobxon topilmadi.");

    const following = await listFollowing(db, identity.userId);

    return {
      ...profile,
      isSelf,
      isFollowing: following.includes(targetId),
      followers: await countFollowers(db, targetId),
      focus: isSelf ? await getFocusSummary(db, identity.userId) : null,
      following: isSelf ? following : [],
    };
  },
});

export const PATCH = defineRoute<UpdateProfileInput, ReaderProfile>({
  schema: updateProfileSchema,
  source: "body",
  handler: ({ db, identity, input }) => updateProfile(db, identity.userId, input),
});

export const OPTIONS = GET;

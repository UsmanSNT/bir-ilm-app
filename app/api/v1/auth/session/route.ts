/**
 * Sessiya.
 *
 * `POST` — mehmon sessiyasini ochadi yoki mavjudini tasdiqlaydi.
 *   - Web:          cookie avtomatik o'rnatiladi, token qaytarilmaydi.
 *   - Android/iOS:  `{ platform: "android", wantToken: true }` yuboradi va
 *                   qaytgan tokenni xavfsiz saqlovda (Keychain / EncryptedSharedPreferences)
 *                   saqlab, keyingi so'rovlarda `Authorization: Bearer <token>` bilan yuboradi.
 *
 * `GET` — joriy foydalanuvchi ma'lumoti.
 */
import { defineRoute } from "@/server/http/handler";
import { TOKEN_MAX_AGE_SECONDS } from "@/server/auth/identity";
import { ensureUser, getProfile } from "@/server/services/social";
import { getUserRole } from "@/server/services/roles";
import { createSessionSchema, type CreateSessionInput, type Session, type Viewer } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<CreateSessionInput, Session>({
  schema: createSessionSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input }) => {
    await ensureUser(db, identity.userId);

    return {
      userId: identity.userId,
      // Tokenni faqat so'ralganda qaytaramiz. Web uni so'ramaydi, chunki
      // HttpOnly cookie XSS hujumidan ko'proq himoya qiladi.
      token: input.wantToken ? identity.token : null,
      expiresAt: new Date(Date.now() + TOKEN_MAX_AGE_SECONDS * 1000).toISOString(),
    };
  },
});

export const GET = defineRoute<undefined, Viewer>({
  handler: async ({ db, identity }) => {
    await ensureUser(db, identity.userId);
    const [profile, role] = await Promise.all([
      getProfile(db, identity.userId),
      getUserRole(db, identity.userId),
    ]);

    return {
      userId: identity.userId,
      name: profile?.name ?? "Kitobxon",
      bio: profile?.bio ?? "",
      posts: profile?.posts ?? 0,
      followers: profile?.followers ?? 0,
      role,
    };
  },
});

export const OPTIONS = POST;

/** Ikkinchi bosqich: xavfsizlik kodi to'g'ri bo'lsa sessiya ochiladi. */
import { defineRoute } from "@/server/http/handler";
import { issueSession } from "@/server/auth/issue-session";
import { clientIp } from "@/server/auth/link-codes";
import { limitAttempt } from "@/server/auth/passwords";
import { readCookie } from "@/server/auth/login-flow";
import { CHALLENGE_COOKIE, completeChallenge } from "@/server/auth/two-factor";
import { badRequest } from "@/server/http/errors";
import { CHALLENGE_PATTERN, verifyTwoFactorSchema, type Session, type VerifyTwoFactorInput } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<VerifyTwoFactorInput, Session>({
  schema: verifyTwoFactorSchema,
  source: "body",
  handler: async (ctx) => {
    limitAttempt("twofactor", [`ip:${clientIp(ctx.request)}`]);
    const challenge = ctx.input.challenge ?? readCookie(ctx.request, CHALLENGE_COOKIE);
    if (!challenge || !CHALLENGE_PATTERN.test(challenge)) throw badRequest("Kirish muddati tugadi. Qaytadan kiring.");
    const userId = await completeChallenge(ctx.db, challenge, ctx.input.code);
    // Cookie'dagi challenge sarflandi.
    ctx.responseHeaders.append("Set-Cookie", `${CHALLENGE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=0`);
    return issueSession(ctx, userId, ctx.input.wantToken);
  },
});

export const OPTIONS = POST;

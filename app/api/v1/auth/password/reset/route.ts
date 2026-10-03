/** Havoladagi token bilan yangi parol: barcha eski sessiyalar yopiladi, shu qurilmada yangisi ochiladi. */
import { defineRoute } from "@/server/http/handler";
import { clientIp } from "@/server/auth/link-codes";
import { issueSession } from "@/server/auth/issue-session";
import { limitAttempt, resetPassword } from "@/server/auth/passwords";
import { startChallenge } from "@/server/auth/two-factor";
import { resetPasswordSchema, type ResetPasswordInput, type Session, type TwoFactorPending } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<ResetPasswordInput, Session | TwoFactorPending>({
  schema: resetPasswordSchema,
  source: "body",
  handler: async (ctx) => {
    limitAttempt("login", [`ip:${clientIp(ctx.request)}`]);
    const userId = await resetPassword(ctx.db, ctx.input.token, ctx.input.password);
    const pending = await startChallenge(ctx.db, userId);
    if (pending) return pending;
    return issueSession(ctx, userId, ctx.input.wantToken);
  },
});

export const OPTIONS = POST;

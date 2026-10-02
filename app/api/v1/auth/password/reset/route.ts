/** Havoladagi token bilan yangi parol: barcha eski sessiyalar yopiladi, shu qurilmada yangisi ochiladi. */
import { defineRoute } from "@/server/http/handler";
import { clientIp } from "@/server/auth/link-codes";
import { issueSession } from "@/server/auth/issue-session";
import { limitAttempt, resetPassword } from "@/server/auth/passwords";
import { resetPasswordSchema, type ResetPasswordInput, type Session } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<ResetPasswordInput, Session>({
  schema: resetPasswordSchema,
  source: "body",
  handler: async (ctx) => {
    limitAttempt("login", [`ip:${clientIp(ctx.request)}`]);
    const userId = await resetPassword(ctx.db, ctx.input.token, ctx.input.password);
    return issueSession(ctx, userId, ctx.input.wantToken);
  },
});

export const OPTIONS = POST;

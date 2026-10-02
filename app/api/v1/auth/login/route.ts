/** Email va parol bilan kirish. Urinishlar IP va email bo'yicha cheklanadi. */
import { defineRoute } from "@/server/http/handler";
import { clientIp } from "@/server/auth/link-codes";
import { issueSession } from "@/server/auth/issue-session";
import { clearAttempts, limitAttempt, loginWithPassword } from "@/server/auth/passwords";
import { passwordLoginSchema, type PasswordLoginInput, type Session } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<PasswordLoginInput, Session>({
  schema: passwordLoginSchema,
  source: "body",
  handler: async (ctx) => {
    const emailKey = `email:${ctx.input.email}`;
    limitAttempt("login", [`ip:${clientIp(ctx.request)}`, emailKey]);
    const userId = await loginWithPassword(ctx.db, ctx.input);
    clearAttempts("login", emailKey);
    return issueSession(ctx, userId, ctx.input.wantToken);
  },
});

export const OPTIONS = POST;

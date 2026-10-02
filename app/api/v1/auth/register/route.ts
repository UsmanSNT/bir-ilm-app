/** Email va parol bilan ro'yxatdan o'tish: hozirgi mehmon ma'lumotlari (savat, progress) saqlanadi. */
import { defineRoute } from "@/server/http/handler";
import { clientIp } from "@/server/auth/link-codes";
import { issueSession } from "@/server/auth/issue-session";
import { limitAttempt, registerWithPassword } from "@/server/auth/passwords";
import { registerSchema, type RegisterInput, type Session } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<RegisterInput, Session>({
  schema: registerSchema,
  source: "body",
  status: 201,
  handler: async (ctx) => {
    limitAttempt("register", [`ip:${clientIp(ctx.request)}`]);
    const userId = await registerWithPassword(ctx.db, ctx.identity.userId, ctx.input);
    return issueSession(ctx, userId, ctx.input.wantToken);
  },
});

export const OPTIONS = POST;

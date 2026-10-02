/** Kirishdan keyin: yangi login sessiyasi; web — cookie, native — token javobda. */
import type { RequestContext } from "@/server/http/handler";
import type { Session } from "@/shared/contract";
import { sessionCookie, TOKEN_MAX_AGE_SECONDS } from "./identity";
import { createSession, deleteSession } from "./sessions";

export async function issueSession<T>(ctx: RequestContext<T>, userId: string, wantToken: boolean): Promise<Session> {
  const { db, identity, request, responseHeaders } = ctx;
  const token = await createSession(db, userId);
  // Oldingi tokenga bog'langan login sessiyasi bo'lsa, u endi kerak emas.
  if (!identity.isNew) await deleteSession(db, identity.token);

  // Handler mehmon uchun qo'ygan cookie o'rniga yangi sessiya cookie'si.
  responseHeaders.delete("Set-Cookie");
  if (identity.platform === "web") responseHeaders.append("Set-Cookie", sessionCookie(request, token));

  return {
    userId,
    token: wantToken ? token : null,
    expiresAt: new Date(Date.now() + TOKEN_MAX_AGE_SECONDS * 1000).toISOString(),
  };
}

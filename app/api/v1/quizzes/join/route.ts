/** Xona kodi bo'yicha viktorinaga kirish. Urinishlar IP bo'yicha cheklanadi (kodni topib olishga qarshi). */
import { defineRoute } from "@/server/http/handler";
import { clientIp } from "@/server/auth/link-codes";
import { limitAttempt } from "@/server/auth/passwords";
import { joinByCode } from "@/server/services/quizzes";
import { joinQuizSchema, type JoinQuizInput, type QuizJoin } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<JoinQuizInput, QuizJoin>({
  schema: joinQuizSchema,
  source: "body",
  handler: async ({ db, input, request }) => {
    limitAttempt("quizjoin", [`ip:${clientIp(request)}`]);
    return joinByCode(db, input.code);
  },
});

export const OPTIONS = POST;

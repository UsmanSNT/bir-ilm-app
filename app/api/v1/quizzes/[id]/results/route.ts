/** Viktorina natijalari tarixi: sessiyalar bo'yicha o'rinlar va mustaqil natijalar. Faqat kirgan foydalanuvchilar. */
import { defineRoute } from "@/server/http/handler";
import { quizResultsHistory } from "@/server/services/quizzes";
import type { QuizResultsHistory } from "@/shared/contract";
import { requireSignedIn } from "@/server/services/community";

export const runtime = "edge";

export const GET = defineRoute<undefined, QuizResultsHistory>({
  handler: async ({ db, identity, params }) => {
    await requireSignedIn(db, identity.userId, "Natijalarni ko'rish");
    return quizResultsHistory(db, params.id);
  },
});

export const OPTIONS = GET;

/**
 * Parolni tiklash havolasini so'rash. Javob har doim bir xil — email ro'yxatda bor-yo'qligi oshkor bo'lmaydi.
 * Havola PUBLIC_URL (proksi orqasida ham to'g'ri domen) asosida yasaladi.
 */
import { defineRoute } from "@/server/http/handler";
import { clientIp } from "@/server/auth/link-codes";
import { createPasswordReset, limitAttempt } from "@/server/auth/passwords";
import { loginConfig } from "@/server/auth/providers";
import { sendPasswordReset } from "@/server/services/notify";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<ForgotPasswordInput, { sent: true }>({
  schema: forgotPasswordSchema,
  source: "body",
  handler: async ({ db, input, request }) => {
    limitAttempt("forgot", [`ip:${clientIp(request)}`, `email:${input.email}`]);
    const reset = await createPasswordReset(db, input.email);
    if (reset) {
      const link = `${loginConfig(request).publicUrl}/?reset=${reset.token}`;
      const delivered = await sendPasswordReset(reset, link, reset.minutes);
      if (!delivered) console.error("[auth] tiklash havolasi yetkazilmadi: email/Telegram sozlanmagan yoki xato.");
    }
    return { sent: true };
  },
});

export const OPTIONS = POST;

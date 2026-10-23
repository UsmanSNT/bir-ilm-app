/** Email + parol: ro'yxatdan o'tish, kirish, tiklash va o'zgartirish. */
import type { ChangePasswordInput, PasswordLoginInput, RegisterInput, RemoveTwoFactorInput, ResetPasswordInput, Session, SetTwoFactorInput, TwoFactorPending, VerifyTwoFactorInput } from "@/shared/contract";
import { API_PREFIX } from "./config";

type Envelope<T> = { data?: T; error?: { message?: string; fields?: Record<string, string[]> } };

async function call<T>(path: string, method: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Internet aloqasini tekshiring.");
  }
  const payload = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || payload.data === undefined) {
    const field = payload.error?.fields && Object.values(payload.error.fields)[0]?.[0];
    throw new Error(field ?? payload.error?.message ?? "So'rov bajarilmadi.");
  }
  return payload.data;
}

export const registerWithPassword = (input: RegisterInput) => call<Session>("/auth/register", "POST", input);
export const loginWithPassword = (input: PasswordLoginInput) => call<Session | TwoFactorPending>("/auth/login", "POST", input);
export const requestPasswordReset = (email: string) => call<{ sent: true }>("/auth/password/forgot", "POST", { email });
export const resetPassword = (input: ResetPasswordInput) => call<Session | TwoFactorPending>("/auth/password/reset", "POST", input);
export const changePassword = (input: ChangePasswordInput) => call<{ changed: true }>("/auth/password", "PUT", input);

export const isTwoFactorPending = (value: Session | TwoFactorPending): value is TwoFactorPending => "twoFactor" in value;
export const verifyTwoFactor = (input: VerifyTwoFactorInput) => call<Session>("/auth/two-factor/verify", "POST", input);
export const setTwoFactorCode = (input: SetTwoFactorInput) => call<{ enabled: true }>("/auth/two-factor", "PUT", input);
export const removeTwoFactorCode = (input: RemoveTwoFactorInput) => call<{ enabled: false }>("/auth/two-factor", "DELETE", input);

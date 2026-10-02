"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, Mail } from "lucide-react";
import { loginWithPassword, registerWithPassword, requestPasswordReset } from "@/lib/api/auth-client";
import { nativeAuth } from "@/lib/api/native-auth";
import { PASSWORD_LIMITS, type Session } from "@/shared/contract";

type Mode = "login" | "register" | "forgot";

/** Kirgandan keyin: ilova tokenni o'zi saqlaydi, web esa yangi cookie bilan qayta yuklanadi. */
export async function finishLogin(session: Session) {
  const native = nativeAuth();
  if (native && session.token) return native.adoptToken(session.token);
  location.assign("/?login=ok");
}

export function PasswordField({ id, value, onChange, autoComplete, label = "Parol" }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: string; label?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <label className="pw-field" htmlFor={id}>
      <span>{label}</span>
      <span className="pw-input">
        <input id={id} type={shown ? "text" : "password"} autoComplete={autoComplete} value={value} maxLength={PASSWORD_LIMITS.max} onChange={(e) => onChange(e.target.value)} required />
        <button type="button" aria-label={shown ? "Parolni yashirish" : "Parolni ko‘rsatish"} onClick={() => setShown((v) => !v)}>{shown ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </span>
    </label>
  );
}

/** Email + parol bilan kirish, hisob ochish va parolni tiklash (alohida rejimlar). */
export default function PasswordAuth({ canReset }: { canReset: boolean }) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const switchTo = (next: Mode) => { setMode(next); setError(""); setSent(false); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const wantToken = Boolean(nativeAuth());
      if (mode === "forgot") {
        await requestPasswordReset(email);
        setSent(true);
        setBusy(false);
        return;
      }
      const session = mode === "login"
        ? await loginWithPassword({ email, password, wantToken })
        : await registerWithPassword({ name, email, password, wantToken });
      await finishLogin(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik yuz berdi.");
      setBusy(false);
    }
  }

  return (
    <form className="pw-form" onSubmit={submit} noValidate>
      <strong className="pw-title"><Mail size={16} />{mode === "login" ? "Email bilan kirish" : mode === "register" ? "Hisob ochish" : "Parolni tiklash"}</strong>
      {mode === "register" && (
        <label className="pw-field" htmlFor="pw-name"><span>Ism</span><input id="pw-name" autoComplete="name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required /></label>
      )}
      <label className="pw-field" htmlFor="pw-email"><span>Email</span><input id="pw-email" type="email" inputMode="email" autoComplete="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} required /></label>
      {mode !== "forgot" && <PasswordField id="pw-password" value={password} onChange={setPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} />}
      {mode === "register" && <small className="pw-hint">Kamida {PASSWORD_LIMITS.min} belgi.</small>}
      {error && <p className="pw-error" role="alert">{error}</p>}
      {sent && <p className="pw-ok" role="status">Agar bu email ro‘yxatda bo‘lsa, tiklash havolasi yuborildi. Pochtangizni (va «Spam»ni) tekshiring.</p>}
      {!sent && <button type="submit" className="button" disabled={busy}>{busy ? "Kuting…" : mode === "login" ? "Kirish" : mode === "register" ? "Hisob ochish" : "Havola yuborish"}</button>}
      <div className="pw-links">
        {mode === "login" && <>
          <span>Hisobingiz yo‘qmi? <button type="button" onClick={() => switchTo("register")}>Hisob ochish</button></span>
          {canReset && <button type="button" onClick={() => switchTo("forgot")}>Parolni unutdingizmi?</button>}
        </>}
        {mode !== "login" && <span>Hisobingiz bormi? <button type="button" onClick={() => switchTo("login")}>Kirish</button></span>}
      </div>
    </form>
  );
}

/** Emaildagi havola orqali yangi parol. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== repeat) return setError("Parollar bir xil emas.");
    setBusy(true);
    setError("");
    try {
      const { resetPassword } = await import("@/lib/api/auth-client");
      await finishLogin(await resetPassword({ token, password, wantToken: Boolean(nativeAuth()) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parol o‘zgarmadi.");
      setBusy(false);
    }
  }

  return (
    <form className="pw-form" onSubmit={submit} noValidate>
      <PasswordField id="reset-password" value={password} onChange={setPassword} autoComplete="new-password" label="Yangi parol" />
      <PasswordField id="reset-repeat" value={repeat} onChange={setRepeat} autoComplete="new-password" label="Yangi parolni takrorlang" />
      <small className="pw-hint">Kamida {PASSWORD_LIMITS.min} belgi. Saqlangach, boshqa qurilmalardagi kirishlar yopiladi.</small>
      {error && <p className="pw-error" role="alert">{error}</p>}
      <button type="submit" className="button" disabled={busy}>{busy ? "Saqlanmoqda…" : "Parolni saqlash"}</button>
    </form>
  );
}

/** Profil sozlamalari: parolni o'zgartirish (yoki email hisobida birinchi marta o'rnatish). */
export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { changePassword } = await import("@/lib/api/auth-client");
      await changePassword({ current, password });
      setCurrent("");
      setPassword("");
      setMessage({ ok: true, text: "Parol yangilandi." });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Parol o‘zgarmadi." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pw-form" onSubmit={submit} noValidate>
      {hasPassword && <PasswordField id="change-current" value={current} onChange={setCurrent} autoComplete="current-password" label="Joriy parol" />}
      <PasswordField id="change-new" value={password} onChange={setPassword} autoComplete="new-password" label="Yangi parol" />
      {message && <p className={message.ok ? "pw-ok" : "pw-error"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
      <button type="submit" className="button" disabled={busy}>{busy ? "Saqlanmoqda…" : "Parolni saqlash"}</button>
    </form>
  );
}

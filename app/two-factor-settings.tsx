"use client";

import { FormEvent, useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { removeTwoFactorCode, setTwoFactorCode } from "@/lib/api/auth-client";
import { notifyViewerChanged } from "@/lib/api/roles-client";
import { SECURITY_CODE_LIMITS, type Viewer } from "@/shared/contract";
import { PasswordField } from "./password-auth";

/** Ikki bosqichli himoya: kirishda parol/Google/Telegram'dan keyin o'zingiz qo'ygan kod ham so'raladi. */
export default function TwoFactorSettings({ viewer }: { viewer: Viewer }) {
  const enabled = viewer.twoFactor;
  const [current, setCurrent] = useState("");
  const [code, setCode] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setCurrent(""); setCode(""); setRepeat(""); setError(""); };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (code !== repeat) return setError("Kodlar bir xil emas.");
    setBusy(true);
    setError("");
    try {
      await setTwoFactorCode({ code, current });
      toast.success(enabled ? "Kod almashtirildi." : "Ikki bosqichli himoya yoqildi.");
      reset();
      notifyViewerChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saqlanmadi.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!current) return setError("Joriy kodni yozing.");
    setBusy(true);
    setError("");
    try {
      await removeTwoFactorCode({ current });
      toast.success("Ikki bosqichli himoya o‘chirildi.");
      reset();
      notifyViewerChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "O‘chirilmadi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pw-form tf" onSubmit={(e) => void save(e)} noValidate>
      <strong className="pw-title">{enabled ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}{enabled ? "Himoya yoqilgan" : "Himoya o‘chiq"}</strong>
      {enabled && <PasswordField id="tf-current" value={current} onChange={setCurrent} autoComplete="off" label="Joriy kod" />}
      <PasswordField id="tf-code" value={code} onChange={setCode} autoComplete="new-password" label={enabled ? "Yangi kod" : "Kod o‘ylab toping"} />
      <PasswordField id="tf-repeat" value={repeat} onChange={setRepeat} autoComplete="new-password" label="Kodni takrorlang" />
      <small className="pw-hint">{SECURITY_CODE_LIMITS.min}–{SECURITY_CODE_LIMITS.max} belgi. Email, Google yoki Telegram bilan kirganda shu kod ham so‘raladi.</small>
      {error && <p className="pw-error" role="alert">{error}</p>}
      <button type="submit" className="button" disabled={busy}>{busy ? "Saqlanmoqda…" : enabled ? "Kodni almashtirish" : "Yoqish"}</button>
      {enabled && <button type="button" className="tf-off" onClick={() => void disable()} disabled={busy}>Himoyani o‘chirish</button>}
    </form>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { verifyTwoFactor } from "@/lib/api/auth-client";
import { nativeAuth } from "@/lib/api/native-auth";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SECURITY_CODE_LIMITS } from "@/shared/contract";
import { finishLogin, PasswordField } from "./password-auth";

/** Ikkinchi bosqich: foydalanuvchi o'zi qo'ygan xavfsizlik kodi. `challenge` yo'q bo'lsa — cookie'dagisi ishlatiladi. */
export function TwoFactorForm({ challenge, onBack }: { challenge?: string; onBack?: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finishLogin(await verifyTwoFactor({ code, challenge, wantToken: Boolean(nativeAuth()) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kod tekshirilmadi.");
      setBusy(false);
    }
  }

  return (
    <form className="pw-form" onSubmit={submit} noValidate>
      <strong className="pw-title"><ShieldCheck size={16} />Xavfsizlik kodi</strong>
      <PasswordField id="twofactor-code" value={code} onChange={setCode} autoComplete="off" label="Kodingizni kiriting" />
      {error && <p className="pw-error" role="alert">{error}</p>}
      <button type="submit" className="button" disabled={busy || code.length < 1}>{busy ? "Tekshirilmoqda…" : "Kirish"}</button>
      {onBack && <div className="pw-links"><button type="button" onClick={onBack}>Orqaga</button></div>}
    </form>
  );
}

/** Google/Telegram'dan qaytgach (`?login=2fa`): kod so'raydigan oyna. */
export function TwoFactorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent>
        <DialogTitle>Ikki bosqichli himoya</DialogTitle>
        <DialogDescription>Hisobingiz xavfsizlik kodi bilan himoyalangan ({SECURITY_CODE_LIMITS.min}+ belgi).</DialogDescription>
        <TwoFactorForm />
      </DialogContent>
    </Dialog>
  );
}

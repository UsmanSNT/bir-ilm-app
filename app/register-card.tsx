"use client";

import { FormEvent, useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Auth } from "./use-member";

// Gate shown wherever chat, posts or follows need a registered member.
export default function RegisterCard({ auth, reason }: { auth: Auth; reason: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (auth.kind === "loading" || auth.kind === "member") return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await auth.register(name.trim()); toast.success("Ro'yxatdan o'tdingiz."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Ro'yxatdan o'tish amalga oshmadi."); }
    finally { setBusy(false); }
  }

  return <section className="register-card" aria-label="Ro'yxatdan o'tish">
    <h3>Ro&apos;yxatdan o&apos;ting</h3>
    <p>{reason}</p>
    {auth.kind === "visitor"
      ? <a className="button" href={auth.signInPath}><LogIn size={18}/>Kirish va ro&apos;yxatdan o&apos;tish</a>
      : <form onSubmit={e => void submit(e)}>
          <input aria-label="Ismingiz" placeholder="Boshqalarga ko'rinadigan ismingiz" minLength={2} maxLength={40} required value={name} onChange={e => setName(e.target.value)}/>
          <button className="button" disabled={busy || name.trim().length < 2}><UserPlus size={18}/>{busy ? "Kutilmoqda..." : "Ro'yxatdan o'tish"}</button>
        </form>}
  </section>;
}

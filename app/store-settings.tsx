"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchStoreProfile, saveStoreProfile } from "@/lib/api/store-client";
import { STORE_LIMITS, type StoreProfile } from "@/shared/contract";

const EMPTY: StoreProfile = { name: "", phone: "", telegram: "", address: "" };

/**
 * Do'kon sozlamalari: yetkazib berish ma'lumotlari. Bir Ilm sozlamalaridan alohida.
 * Buyurtma berish formasi shu ma'lumotlarni oldindan to'ldiradi; server qoidalari (telefon, Telegram) bir xil.
 */
export default function StoreSettings() {
  const [form, setForm] = useState<StoreProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchStoreProfile().then((saved) => { if (alive) setForm(saved); }).catch(() => { if (alive) setForm(EMPTY); });
    return () => { alive = false; };
  }, []);

  if (!form) return <p className="zb-muted" role="status">Yuklanmoqda...</p>;

  const set = (key: keyof StoreProfile) => (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      setForm(await saveStoreProfile(form));
      toast.success("Do‘kon sozlamalari saqlandi");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saqlanmadi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ss" onSubmit={(e) => void submit(e)} aria-label="Do‘kon sozlamalari">
      <h3>Yetkazib berish ma‘lumotlari</h3>
      <p className="zb-muted">Buyurtma berishda shu ma’lumotlar oldindan to‘ldiriladi. Bu faqat do‘konga tegishli; Bir Ilm sozlamalariga ta’sir qilmaydi.</p>
      <label className="ss-field">
        <span>Ism</span>
        <input value={form.name} maxLength={STORE_LIMITS.name} onChange={set("name")} disabled={busy} autoComplete="name" />
      </label>
      <label className="ss-field">
        <span>Telefon</span>
        <input inputMode="tel" placeholder="+998 90 123 45 67" value={form.phone} onChange={set("phone")} disabled={busy} autoComplete="tel" />
      </label>
      <label className="ss-field">
        <span>Telegram</span>
        <input placeholder="@nom" value={form.telegram} onChange={set("telegram")} disabled={busy} autoComplete="off" />
      </label>
      <label className="ss-field">
        <span>Manzil</span>
        <textarea rows={3} maxLength={STORE_LIMITS.address} value={form.address} onChange={set("address")} disabled={busy} />
      </label>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button type="submit" className="zb-btn zb-btn-primary ss-save" disabled={busy}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
    </form>
  );
}

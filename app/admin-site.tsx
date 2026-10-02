"use client";

import { FormEvent, useState } from "react";
import { Facebook, Instagram, Telegram, YouTube } from "./brand-icons";
import { toast } from "sonner";
import { notifySiteChanged, saveSiteLinks, useSiteLinks } from "@/lib/api/site-client";
import { SOCIAL_KEYS, SOCIAL_LABELS, type SiteLinks, type SocialKey } from "@/shared/contract";

const ICONS = { telegram: Telegram, youtube: YouTube, instagram: Instagram, facebook: Facebook } as const;
const HINTS: Record<SocialKey, string> = {
  telegram: "https://t.me/kanal_nomi yoki @kanal_nomi",
  youtube: "https://youtube.com/@kanal_nomi",
  instagram: "https://instagram.com/sahifa_nomi",
  facebook: "https://facebook.com/sahifa_nomi",
};

/** Admin: Bir Ilm'ning ijtimoiy tarmoq havolalari. Bo'sh qoldirilgan tarmoq ilovada ko'rinmaydi. */
export default function AdminSite() {
  const { value: links, loading } = useSiteLinks();
  if (loading) return <p className="admin-empty">Yuklanmoqda…</p>;
  return <LinksForm initial={links} />;
}

function LinksForm({ initial }: { initial: SiteLinks }) {
  const [form, setForm] = useState<Record<SocialKey, string>>({ telegram: initial.telegram ?? "", youtube: initial.youtube ?? "", instagram: initial.instagram ?? "", facebook: initial.facebook ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await saveSiteLinks(form);
      notifySiteChanged();
      toast.success("Havolalar saqlandi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saqlanmadi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-panel admin-site" onSubmit={(e) => void submit(e)}>
      <p className="admin-intro">Bir Ilm sahifalari havolalari bosh sahifada «Bizni kuzating» blokida chiqadi. Kerak bo‘lmagan tarmoqni bo‘sh qoldiring.</p>
      {SOCIAL_KEYS.map((key) => {
        const Icon = ICONS[key];
        return (
          <label className="device-field" key={key}>
            <span><Icon size={16} /> {SOCIAL_LABELS[key]}</span>
            <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={HINTS[key]} inputMode="url" autoComplete="off" maxLength={300} />
          </label>
        );
      })}
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button className="admin-add-book" disabled={busy}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
    </form>
  );
}

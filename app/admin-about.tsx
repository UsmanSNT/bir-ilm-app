"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { notifySiteChanged, saveAbout, useAbout } from "@/lib/api/site-client";
import { ABOUT_LIMITS, resolveAboutVideo, type AboutSettings } from "@/shared/contract";
import { computeJourney, formatSpan, isValidAnchor } from "@/shared/journey";
import { useNow } from "./talk-format";
import { uzDateTashkent } from "./uz-date";

/** Admin: «Biz haqimizda» matni, tanishtiruv videosi va hisobning tayanch nuqtasi. */
export default function AdminAbout() {
  const { value, loading } = useAbout();
  if (loading) return <p className="admin-empty">Yuklanmoqda…</p>;
  return <AboutForm initial={value} />;
}

function AboutForm({ initial }: { initial: AboutSettings }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const minute = Math.floor(useNow(60_000) / 60_000) * 60_000;

  const preview = useMemo(() => (isValidAnchor(form.anchor) ? computeJourney(form.anchor, minute) : null), [form.anchor, minute]);
  const videoOk = resolveAboutVideo(form.videoUrl) !== null;
  const set = <K extends keyof AboutSettings>(key: K, next: AboutSettings[K]) => setForm((current) => ({ ...current, [key]: next }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setForm(await saveAbout(form));
      notifySiteChanged();
      toast.success("«Biz haqimizda» saqlandi");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-panel ab-admin" onSubmit={(e) => void submit(e)}>
      <label className="ab-admin-field">
        <span>Bir Ilm haqida matn <small>{form.intro.length}/{ABOUT_LIMITS.intro}</small></span>
        <textarea rows={7} required maxLength={ABOUT_LIMITS.intro} value={form.intro} onChange={(e) => set("intro", e.target.value)} />
        <small>Xatboshini ajratish uchun bo‘sh qator qoldiring.</small>
      </label>

      <label className="ab-admin-field">
        <span>Tanishtiruv videosi</span>
        <input inputMode="url" autoComplete="off" maxLength={ABOUT_LIMITS.videoUrl} placeholder="Bo‘sh — ilova bilan kelgan video" value={form.videoUrl} aria-invalid={!videoOk} onChange={(e) => set("videoUrl", e.target.value)} />
        <small className={videoOk ? undefined : "ab-admin-bad"}>
          {videoOk
            ? form.videoUrl.trim()
              ? "Shu havoladagi video ko‘rsatiladi."
              : "Hozir Bir Ilm tanishtiruv videosi (34 soniya) ko‘rsatiladi. Boshqasini qo‘yish uchun YouTube, Instagram, Facebook yoki https .mp4 havola yozing."
            : "Havola tanilmadi: YouTube, Instagram, Facebook yoki https .mp4/.webm bo‘lsin."}
        </small>
      </label>

      <fieldset className="ab-admin-anchor">
        <legend>Hisob nuqtasi</legend>
        <p>Bitta aniq ma‘lum muhokamani kiriting. Boshlanish sanasi, yillar bo‘yicha soni va bosqichlar shundan hisoblanadi.</p>
        <div className="ab-admin-two">
          <label className="ab-admin-field">
            <span>Kitob raqami</span>
            <input type="number" min={1} max={ABOUT_LIMITS.anchorMax} required value={form.anchor.number || ""} onChange={(e) => set("anchor", { ...form.anchor, number: Number(e.target.value) })} />
          </label>
          <label className="ab-admin-field">
            <span>Muhokama sanasi (shanba)</span>
            <input type="date" required value={form.anchor.date} onChange={(e) => set("anchor", { ...form.anchor, date: e.target.value })} />
          </label>
        </div>
        {preview ? (
          <p className="ab-admin-preview">
            <CheckCircle2 size={16} />
            <span>Boshlanish: {uzDateTashkent(preview.start)} · hozirgacha {preview.completed} ta kitob · {formatSpan(preview.elapsed)} · keyingisi {preview.next.n}-kitob ({uzDateTashkent(preview.next.at)})</span>
          </p>
        ) : (
          <p className="ab-admin-preview is-bad">
            <CircleAlert size={16} />
            <span>Sana shanba kuni, raqam esa musbat butun son bo‘lishi kerak.</span>
          </p>
        )}
      </fieldset>

      {error && <p className="admin-error" role="alert">{error}</p>}
      <button className="admin-add-book" disabled={busy || !videoOk || !preview}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
    </form>
  );
}

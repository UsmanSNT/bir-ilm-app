"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Save } from "lucide-react";
import { toast } from "sonner";
import { ABOUT_LIMITS, parseVideoUrl, type AboutSettings } from "@/lib/about";
import { computeJourney, formatSpan, formatUzDate, isValidAnchor } from "@/lib/journey";
import { useMinuteClock } from "../use-about";

const API = "/api/admin/about";

export default function AboutPanel() {
  const [form, setForm] = useState<AboutSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useMinuteClock();

  useEffect(() => {
    let active = true;
    fetch(API)
      .then(async (response) => {
        const payload = (await response.json()) as { settings?: AboutSettings; error?: string };
        if (!response.ok || !payload.settings) throw new Error(payload.error ?? "Yuklanmadi.");
        if (active) setForm(payload.settings);
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Yuklanmadi."));
    return () => {
      active = false;
    };
  }, []);

  const preview = useMemo(() => {
    if (!form || !isValidAnchor(form.anchor)) return null;
    return computeJourney(form.anchor, now);
  }, [form, now]);

  if (!form) return <p className="admin-empty">Yuklanmoqda…</p>;

  const videoOk = !form.videoUrl.trim() || parseVideoUrl(form.videoUrl) !== null;
  const set = <K extends keyof AboutSettings>(key: K, value: AboutSettings[K]) => setForm({ ...form, [key]: value });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const payload = (await response.json()) as { settings?: AboutSettings; error?: string };
      if (!response.ok || !payload.settings) throw new Error(payload.error ?? "Saqlanmadi.");
      setForm(payload.settings);
      toast.success("Saqlandi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Saqlanmadi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-card admin-form-inline" onSubmit={save}>
      <label>
        Bir Ilm haqida matn ({form.intro.length}/{ABOUT_LIMITS.intro})
        <textarea rows={6} required maxLength={ABOUT_LIMITS.intro} value={form.intro} onChange={(e) => set("intro", e.target.value)} />
        <small>Xatboshini ajratish uchun bo&apos;sh qator qoldiring.</small>
      </label>

      <label>
        Tanishtiruv videosi havolasi
        <input
          type="url"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=… yoki https://…/video.mp4"
          maxLength={ABOUT_LIMITS.videoUrl}
          value={form.videoUrl}
          aria-invalid={!videoOk}
          onChange={(e) => set("videoUrl", e.target.value)}
        />
        <small className={videoOk ? undefined : "admin-error"}>
          {videoOk ? "YouTube (oddiy, Shorts yoki youtu.be) yoki to'g'ridan-to'g'ri .mp4/.webm havola. Bo'sh qolsa \"tez orada\" ko'rinadi." : "Havola tanilmadi."}
        </small>
      </label>

      <fieldset className="admin-anchor">
        <legend>Hisob nuqtasi</legend>
        <p>Bitta aniq ma&apos;lum muhokamani kiriting. Qolgan barcha raqamlar (boshlanish sanasi, yillar bo&apos;yicha soni) shundan hisoblanadi.</p>
        <div className="admin-two">
          <label>
            Kitob raqami
            <input type="number" min={1} max={10000} required value={form.anchor.number || ""} onChange={(e) => set("anchor", { ...form.anchor, number: Number(e.target.value) })} />
          </label>
          <label>
            Muhokama sanasi (shanba)
            <input type="date" required value={form.anchor.date} onChange={(e) => set("anchor", { ...form.anchor, date: e.target.value })} />
          </label>
        </div>
        {preview ? (
          <p className="admin-preview">
            <CheckCircle2 size={16} /> Boshlanish: {formatUzDate(preview.start)} · hozirgacha {preview.completed} ta kitob · {formatSpan(preview.elapsed)} · keyingisi {preview.next.n}-kitob ({formatUzDate(preview.next.at)})
          </p>
        ) : (
          <p className="admin-preview admin-error">
            <CircleAlert size={16} /> Sana shanba kuni va raqam musbat butun son bo&apos;lishi kerak.
          </p>
        )}
      </fieldset>

      <div className="admin-form-foot">
        <button type="submit" className="admin-btn primary" disabled={busy || !videoOk || !preview}>
          <Save size={16} /> Saqlash
        </button>
      </div>
    </form>
  );
}

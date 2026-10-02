"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Mic, ShieldCheck } from "lucide-react";
import { CAMERA_KEY, MIC_KEY, rememberDevice, savedDevice } from "@/lib/api/live-media";

type Devices = { cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] };

/** Jonli suhbat uchun kamera va mikrofonni tanlash. Tanlov shu brauzerda saqlanadi va suhbatda qo'llanadi. */
export default function DeviceSettings() {
  const [devices, setDevices] = useState<Devices>({ cameras: [], mics: [] });
  const [camera, setCamera] = useState(() => savedDevice(CAMERA_KEY) ?? "");
  const [mic, setMic] = useState(() => savedDevice(MIC_KEY) ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const unsupported = typeof navigator !== "undefined" && !navigator.mediaDevices?.enumerateDevices;

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices({ cameras: all.filter((d) => d.kind === "videoinput"), mics: all.filter((d) => d.kind === "audioinput") });
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, [refresh]);

  // Brauzer ruxsatsiz qurilma nomlarini bermaydi: bir lahzaga yoqib, darhol o'chiramiz.
  async function allow() {
    setBusy(true);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(() => navigator.mediaDevices.getUserMedia({ audio: true }));
      stream.getTracks().forEach((t) => t.stop());
      await refresh();
    } catch {
      setError("Brauzer ruxsat bermadi. Manzil satridagi qulf belgisidan kamera va mikrofonni yoqing.");
    } finally {
      setBusy(false);
    }
  }

  const named = devices.cameras.some((d) => d.label) || devices.mics.some((d) => d.label);
  const pick = (key: string, set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    if (e.target.value) rememberDevice(key, e.target.value);
    else try { localStorage.removeItem(key); } catch { /* shaxsiy rejim */ }
  };

  if (unsupported) return <div className="p-info"><ShieldCheck /><h2>Qurilmalar ko‘rinmayapti</h2><p>Kamera va mikrofon faqat HTTPS saytda va yangi brauzerda ishlaydi.</p></div>;

  return (
    <div className="p-settings device-settings">
      <p className="p-settings-intro">Jonli suhbatda ishlatiladigan kamera va mikrofonni shu yerda tanlang. Suhbat oynasida qurilma tanlash yo‘q — tanlov o‘zi qo‘llanadi.</p>
      {!named && <button type="button" className="p-primary" onClick={() => void allow()} disabled={busy}>{busy ? "So‘ralmoqda…" : "Ruxsat berish va qurilmalarni ko‘rsatish"}</button>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      <label className="device-field">
        <span><Camera size={16} /> Kamera</span>
        <select value={camera} onChange={pick(CAMERA_KEY, setCamera)}>
          <option value="">Avtomatik (virtual kameradan qochadi)</option>
          {devices.cameras.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Kamera ${i + 1}`}</option>)}
        </select>
      </label>
      <label className="device-field">
        <span><Mic size={16} /> Mikrofon</span>
        <select value={mic} onChange={pick(MIC_KEY, setMic)}>
          <option value="">Standart mikrofon</option>
          {devices.mics.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Mikrofon ${i + 1}`}</option>)}
        </select>
      </label>
      <p className="p-settings-intro">Tanlov faqat shu brauzerda saqlanadi. Boshqa qurilmada alohida tanlanadi.</p>
    </div>
  );
}

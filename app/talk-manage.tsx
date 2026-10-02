"use client";

import { useRef, useState } from "react";
import { CalendarClock, Download, FileAudio, Megaphone, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { uploadChunked } from "@/lib/api/books-client";
import { API_PREFIX } from "@/lib/api/config";
import { deleteLiveRecording, deleteLiveSession, removeLiveArchive, updateLiveSession, withMediaUrls } from "@/lib/api/live-client";
import { LIMITS_LIVE, type LiveSession } from "@/shared/contract";
import { clock, dayMonth, localInput, notifyTalksChanged, talkRescheduled } from "./talk-format";

// Suhbatni boshqarish (admin/moderator): xom yozuvni yuklab olish, ishlov berilgan
// audioni joylash — shundan keyin suhbat «O'tgan suhbatlar»da hammaga ko'rinadi.

function mb(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.max(0.1, bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function length(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function TalkManage({
  session,
  isAdmin,
  onClose,
  onChange,
  onRemove,
}: {
  session: LiveSession;
  isAdmin: boolean;
  onClose: () => void;
  onChange: (session: LiveSession) => void;
  onRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [when, setWhen] = useState(() => localInput(new Date(session.scheduledAt)));
  const [talkTitle, setTalkTitle] = useState(session.title);
  const [announce, setAnnounce] = useState(true);
  const whenChanged = when !== localInput(new Date(session.scheduledAt));

  /** Vaqt va sarlavhani saqlaydi (faqat admin). */
  async function reschedule() {
    const title = talkTitle.trim();
    if (!title) return toast.error("Sarlavhani yozing.");
    const at = new Date(when);
    if (whenChanged && at.getTime() <= Date.now()) return toast.error("Suhbat vaqti kelajakda bo‘lsin.");
    if (!whenChanged && title === session.title) return toast("O‘zgarish yo‘q.");
    setBusy(true);
    const result = await updateLiveSession(session.id, {
      ...(whenChanged ? { scheduledAt: at.toISOString() } : {}),
      ...(title !== session.title ? { title } : {}),
      announcement: announce && whenChanged ? talkRescheduled(session.bookTitle, title, at) : undefined,
    });
    setBusy(false);
    if (typeof result === "string") return toast.error(result);
    onChange(result);
    notifyTalksChanged();
    toast.success(whenChanged ? `Suhbat vaqti o‘zgartirildi: ${dayMonth(at)}, ${clock(at)}` : "Suhbat yangilandi");
  }

  async function upload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) return toast.error("Audio fayl tanlang (MP3, M4A, OGG, WAV, FLAC).");
    if (file.size > LIMITS_LIVE.archiveBytes) return toast.error("Audio 1 GB dan oshmasin.");
    setBusy(true);
    abortRef.current = new AbortController();
    try {
      const data = await uploadChunked<{ session: LiveSession }>(
        `${API_PREFIX}/live/${encodeURIComponent(session.id)}/archive`,
        file,
        (sent, total) => setProgress({ sent, total }),
        { signal: abortRef.current.signal },
      );
      onChange(withMediaUrls(data.session));
      toast.success("Audio joylandi — «O‘tgan suhbatlar»da hammaga ko‘rinadi");
    } catch (error) {
      if (abortRef.current?.signal.aborted) toast("Yuklash to‘xtatildi. Qayta tanlasangiz, to‘xtagan joyidan davom etadi.");
      else toast.error(error instanceof Error ? error.message : "Yuklab bo‘lmadi.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function unpublish() {
    if (!window.confirm("Audio olib tashlansinmi? Suhbat yana faqat adminlarga ko‘rinadi.")) return;
    setBusy(true);
    const next = await removeLiveArchive(session.id);
    setBusy(false);
    if (next) onChange(next);
    else toast.error("Olib tashlab bo‘lmadi.");
  }

  async function dropRecording(id: string) {
    if (!window.confirm("Bu xom yozuv butunlay o‘chirilsinmi?")) return;
    setBusy(true);
    const ok = await deleteLiveRecording(session.id, id);
    setBusy(false);
    if (ok) onChange({ ...session, recordings: session.recordings.filter((r) => r.id !== id) });
    else toast.error("O‘chirib bo‘lmadi.");
  }

  async function dropSession() {
    if (!window.confirm(`«${session.bookTitle} – ${session.title}» suhbati, izohlari va yozuvlari o‘chirilsinmi?`)) return;
    setBusy(true);
    const ok = await deleteLiveSession(session.id);
    setBusy(false);
    if (!ok) return toast.error("O‘chirib bo‘lmadi.");
    onRemove(session.id);
    notifyTalksChanged();
    toast.success("Suhbat o‘chirildi");
    onClose();
  }

  const percent = progress ? Math.floor((progress.sent / Math.max(1, progress.total)) * 100) : 0;

  // «Saqlash» bilan bir qatorda turadi (vaqtni o'zgartirish bo'limi bo'lmasa — pastda alohida).
  const deleteButton = (
    <button type="button" className="tb-danger" disabled={busy || session.status === "live"} onClick={dropSession} title={session.status === "live" ? "Jonli suhbatni avval tugating" : undefined}>
      <Trash2 size={16} /> {session.status === "live" ? "Avval tugating" : "O‘chirish"}
    </button>
  );

  return (
    <div className="tb-sheet-backdrop" onClick={() => !busy && onClose()}>
      <div className="tb-sheet" role="dialog" aria-modal="true" aria-label="Suhbatni boshqarish" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <strong>{session.bookTitle}</strong>
            <small>{session.title}</small>
          </div>
          <button type="button" aria-label="Yopish" disabled={busy} onClick={onClose}><X size={20} /></button>
        </header>

        {isAdmin && session.status !== "ended" && (
          <section className="tb-resched" aria-label="Suhbat vaqti">
            <h4><span className="tb-resched-title"><CalendarClock size={16} /> Suhbat vaqti</span></h4>
            <input
              type="datetime-local"
              aria-label="Suhbat sanasi va vaqti"
              min={localInput(new Date())}
              value={when}
              disabled={busy || session.status !== "planned"}
              onChange={(e) => setWhen(e.target.value)}
            />
            <input aria-label="Suhbat sarlavhasi" value={talkTitle} maxLength={200} disabled={busy} onChange={(e) => setTalkTitle(e.target.value)} />
            {session.status === "planned" && whenChanged && (
              <label className="tb-resched-announce">
                <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
                <Megaphone size={15} /> Vaqt o‘zgarganini bosh sahifada e’lon qilish
              </label>
            )}
            {session.status === "live" && <small className="tb-sheet-empty">Suhbat boshlangan — vaqti o‘zgarmaydi, faqat sarlavha.</small>}
            <div className="tb-actions-row">
              <button type="button" className="tb-sheet-btn tb-resched-save" disabled={busy} onClick={reschedule}>Saqlash</button>
              {isAdmin && deleteButton}
            </div>
          </section>
        )}

        {session.status === "ended" && (
          <>
            <h4>Xom yozuvlar <span>faqat admin va moderator</span></h4>
            {session.recordings.length === 0 && <p className="tb-sheet-empty">Bu suhbat yozib olinmagan.</p>}
            <ul className="tb-recs">
              {session.recordings.map((rec, index) => (
                <li key={rec.id}>
                  <FileAudio size={18} />
                  <span>
                    <b>{index + 1}-yozuv</b>
                    <small>{length(rec.seconds)} · {mb(rec.bytes)}</small>
                  </span>
                  <a href={`${rec.url}?download=1`} download aria-label={`${index + 1}-yozuvni yuklab olish`}><Download size={17} /></a>
                  {isAdmin && (
                    <button type="button" aria-label="Yozuvni o‘chirish" disabled={busy} onClick={() => dropRecording(rec.id)}><Trash2 size={16} /></button>
                  )}
                </li>
              ))}
            </ul>

            <h4>Tayyor audio <span>hammaga ko‘rinadi</span></h4>
            {session.archive ? (
              <div className="tb-archive">
                <audio controls preload="none" src={session.archive.url} />
                <small>{length(session.archive.seconds)} · {mb(session.archive.bytes)}</small>
                <div>
                  <label className={`tb-sheet-btn${busy ? " is-disabled" : ""}`}>
                    <Upload size={16} /> Almashtirish
                    <input type="file" accept="audio/*" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  <button type="button" className="tb-sheet-btn" disabled={busy} onClick={unpublish}>Olib tashlash</button>
                </div>
              </div>
            ) : (
              <label className={`tb-upload${busy ? " is-disabled" : ""}`}>
                <Upload size={20} />
                <span>
                  <strong>Ishlov berilgan audioni joylash</strong>
                  <small>Yozuvni yuklab oling, tahrirlang va shu yerga qo‘ying · MP3, M4A, OGG · 1 GB gacha</small>
                </span>
                <input type="file" accept="audio/*" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            )}
            {progress && (
              <div className="tb-progress" role="status">
                <span>Yuklanmoqda… {percent}% · {mb(progress.sent)} / {mb(progress.total)}</span>
                <span className="bar"><i style={{ width: `${percent}%` }} /></span>
                <button type="button" onClick={() => abortRef.current?.abort()}>To‘xtatish</button>
              </div>
            )}
          </>
        )}

        {isAdmin && session.status === "ended" && deleteButton}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CalendarClock, Headphones, ImagePlus, Megaphone, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createBook, deleteBook, deleteTrack, notifyCatalogChanged, saveTracks, updateBook, uploadBookMedia } from "@/lib/api/books-client";
import { createLiveSession, fetchLiveSessions } from "@/lib/api/live-client";
import { useViewer } from "@/lib/api/roles-client";
import { BOOK_LIMITS, type Book, type LiveSession } from "@/shared/contract";
import { WEEKDAYS, clock, dayMonth, nextTalk, notifyTalksChanged, talkAnnouncement } from "./talk-format";

/** `<input type="datetime-local">` qiymati (mahalliy vaqt). */
function localInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const COLORS = ["#0f4f45", "#294256", "#7a3b2e", "#5b4a8b", "#8a6511", "#2f6f8f", "#374151"];

function mb(bytes: number) {
  return bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.max(0.1, bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Audiokitob qismi: yuklangani (`id`) yoki endi yuklanadigan fayl (`file`). */
type Part = { key: string; id?: string; title: string; bytes: number; file?: File };

// "2-bob.mp3" "10-bob.mp3" dan keyin emas, oldin tursin.
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
const titleOf = (file: File) => file.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0, BOOK_LIMITS.trackTitle);

/** Kitob qo'shish/tahrirlash (admin va moderator). `book` bo'lmasa — yangi kitob. */
export default function BookEditor({
  book,
  open,
  onClose,
  asWeekBook = false,
}: {
  book: Book | null;
  open: boolean;
  onClose: () => void;
  /** Yangi kitob «Haftaning kitobi» belgisi bilan ochiladi (bosh sahifadan). */
  asWeekBook?: boolean;
}) {
  return open ? <EditorDialog key={book?.id ?? "new"} book={book} onClose={onClose} asWeekBook={asWeekBook} /> : null;
}

function EditorDialog({ book, onClose, asWeekBook }: { book: Book | null; onClose: () => void; asWeekBook: boolean }) {
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [summary, setSummary] = useState(book?.summary ?? "");
  const [color, setColor] = useState(book?.color ?? COLORS[0]);
  const [active, setActive] = useState(book?.active ?? asWeekBook);
  // Hafta kitobi bilan birga suhbat vaqtini belgilash (faqat admin suhbat yarata oladi).
  const isAdmin = useViewer()?.role === "admin";
  const [talkWhen, setTalkWhen] = useState("");
  const [talkTitle, setTalkTitle] = useState("Birga tahlil qilamiz");
  const [announce, setAnnounce] = useState(true);
  const [existingTalk, setExistingTalk] = useState<LiveSession | null>(null);
  const talkCreated = useRef(false);

  useEffect(() => {
    if (!isAdmin || !book) return;
    fetchLiveSessions().then((list) => setExistingTalk(nextTalk(list.filter((s) => s.bookTitle.trim().toLowerCase() === book.title.trim().toLowerCase()))));
  }, [isAdmin, book]);
  const [cover, setCover] = useState<File | null>(null);
  const [parts, setParts] = useState<Part[]>(() => (book?.tracks ?? []).map((t) => ({ key: t.id, id: t.id, title: t.title, bytes: t.bytes })));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ label: string; sent: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const preview = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pickCover(file?: File) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast.error("Muqova JPG, PNG yoki WEBP bo‘lsin.");
    if (file.size > BOOK_LIMITS.coverBytes) return toast.error("Muqova 5 MB dan oshmasin.");
    setCover(file);
  }

  const totalBytes = parts.reduce((sum, p) => sum + p.bytes, 0);

  function pickAudio(list: FileList | null) {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("audio/")).sort(byName);
    if (!files.length) return toast.error("Audio fayl tanlang (MP3, M4A, OGG, WAV, FLAC).");
    if (parts.length + files.length > BOOK_LIMITS.maxTracks) return toast.error(`Audiokitob ${BOOK_LIMITS.maxTracks} qismdan oshmasin.`);
    const added = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes + added > BOOK_LIMITS.audioBytes) return toast.error(`Barcha qismlar jami 1 GB dan oshmasin (bo‘ladi: ${mb(totalBytes + added)}).`);
    setParts((prev) => [...prev, ...files.map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, title: titleOf(file), bytes: file.size, file }))]);
  }

  function move(index: number, step: -1 | 1) {
    setParts((prev) => {
      const next = [...prev];
      const target = index + step;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (isAdmin && active && talkWhen && !talkCreated.current && new Date(talkWhen).getTime() <= Date.now()) {
      toast.error("Suhbat vaqti kelajakda bo‘lsin.");
      return;
    }
    setBusy(true);
    abortRef.current = new AbortController();
    try {
      const fields = { title: title.trim(), author: author.trim(), summary: summary.trim(), color };
      let saved = book ? await updateBook(book.id, { ...fields, active }) : await createBook(fields);
      if (!book && active) saved = await updateBook(saved.id, { active: true });

      // Suhbat fayllardan oldin e'lon qilinadi: yuklash uzilsa ham suhbat belgilanib qoladi.
      if (isAdmin && active && talkWhen && !talkCreated.current) {
        const when = new Date(talkWhen);
        const talk = await createLiveSession({
          bookTitle: saved.title,
          title: talkTitle.trim() || "Birga tahlil qilamiz",
          scheduledAt: when.toISOString(),
          announcement: announce ? talkAnnouncement(saved.title, talkTitle.trim() || "Birga tahlil qilamiz", when) : undefined,
        });
        if (!talk) throw new Error("Kitob saqlandi, lekin suhbatni e’lon qilib bo‘lmadi. Qayta bosing.");
        talkCreated.current = true;
        notifyTalksChanged();
        toast.success(`Suhbat e’lon qilindi: ${dayMonth(when)}, ${clock(when)}`);
      }

      if (cover) {
        setProgress({ label: "Muqova", sent: 0, total: cover.size });
        saved = await uploadBookMedia(saved.id, "cover", cover, (sent, total) => setProgress({ label: "Muqova", sent, total }), abortRef.current.signal);
      }

      // Olib tashlangan qismlar, keyin yangilari (tartib bilan), oxirida umumiy tartib va nomlar.
      const kept = new Set(parts.map((p) => p.id).filter(Boolean));
      for (const track of book?.tracks ?? []) if (!kept.has(track.id)) saved = await deleteTrack(saved.id, track.id);
      const ids = new Map<string, string>();
      const fresh = parts.filter((p) => p.file);
      for (const [index, part] of fresh.entries()) {
        const label = `${index + 1}/${fresh.length}-qism`;
        const before = new Set(saved.tracks.map((t) => t.id));
        saved = await uploadBookMedia(saved.id, "audio", part.file!, (sent, total) => setProgress({ label, sent, total }), abortRef.current.signal, part.title);
        const created = saved.tracks.find((t) => !before.has(t.id));
        if (created) ids.set(part.key, created.id);
      }
      const order = parts
        .map((p, index) => ({ id: p.id ?? ids.get(p.key) ?? "", title: p.title.trim() || `${index + 1}-qism` }))
        .filter((p) => p.id);
      if (order.length) saved = await saveTracks(saved.id, order);
      notifyCatalogChanged();
      toast.success(book ? "Kitob yangilandi" : "Kitob qo‘shildi");
      onClose();
    } catch (error) {
      if (abortRef.current?.signal.aborted) toast("Yuklash to‘xtatildi. Qayta bosing — to‘xtagan joyidan davom etadi.");
      else toast.error(error instanceof Error ? error.message : "Saqlanmadi.");
      notifyCatalogChanged();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function remove() {
    if (!book || !window.confirm(`«${book.title}» va uning audio/muqovasi o‘chirilsinmi?`)) return;
    setBusy(true);
    try {
      await deleteBook(book.id);
      notifyCatalogChanged();
      toast.success("Kitob o‘chirildi");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "O‘chirilmadi.");
    } finally {
      setBusy(false);
    }
  }

  const coverShown = preview ?? book?.coverUrl ?? null;
  const percent = progress ? Math.floor((progress.sent / Math.max(1, progress.total)) * 100) : 0;

  return (
    <Dialog open onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
      <DialogContent className="book-editor">
        <DialogTitle>{book ? "Kitobni tahrirlash" : asWeekBook ? "Yangi hafta kitobi" : "Yangi kitob"}</DialogTitle>
        <DialogDescription>Muqova rasmini chapdagi katakdan, audio qismlarni pastdagi tugmadan yuklang. Faqat admin va moderator ko‘radi.</DialogDescription>
        <form onSubmit={save}>
          <div className="book-editor-top">
            <label className="book-editor-cover" style={{ backgroundColor: color }}>
              {coverShown ? <img src={coverShown} alt="" /> : <span><ImagePlus size={22} />Muqova</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <div className="book-editor-fields">
              <input aria-label="Kitob nomi" placeholder="Kitob nomi" required maxLength={BOOK_LIMITS.title} value={title} onChange={(e) => setTitle(e.target.value)} />
              <input aria-label="Muallif" placeholder="Muallif" required maxLength={BOOK_LIMITS.author} value={author} onChange={(e) => setAuthor(e.target.value)} />
              <div className="book-editor-colors" role="radiogroup" aria-label="Muqova rangi">
                {COLORS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} style={{ backgroundColor: c }} onClick={() => setColor(c)} aria-label={c} />
                ))}
              </div>
            </div>
          </div>
          <textarea aria-label="Tavsif" placeholder="Qisqacha tavsif (ixtiyoriy)" rows={3} maxLength={BOOK_LIMITS.summary} value={summary} onChange={(e) => setSummary(e.target.value)} />

          <label className="book-editor-audio">
            <Headphones size={18} />
            <span>
              <strong>{parts.length ? "Yana qism qo‘shish" : "Audiokitob fayllarini tanlang"}</strong>
              <small>Bir nechta faylni birdan tanlang · {BOOK_LIMITS.maxTracks} tagacha, jami 1 GB{totalBytes ? ` · hozir ${mb(totalBytes)}` : ""}</small>
            </span>
            <Upload size={16} />
            <input type="file" accept="audio/*" multiple disabled={busy} onChange={(e) => { pickAudio(e.target.files); e.target.value = ""; }} />
          </label>

          {parts.length > 0 && (
            <ol className="book-editor-parts" aria-label="Audiokitob qismlari (ijro tartibi)">
              {parts.map((part, index) => (
                <li key={part.key} className={part.file ? "is-new" : undefined}>
                  <b>{index + 1}</b>
                  <input
                    aria-label={`${index + 1}-qism nomi`}
                    value={part.title}
                    placeholder={`${index + 1}-qism`}
                    maxLength={BOOK_LIMITS.trackTitle}
                    disabled={busy}
                    onChange={(e) => setParts((prev) => prev.map((p) => (p.key === part.key ? { ...p, title: e.target.value } : p)))}
                  />
                  <small>{part.file ? "yangi · " : ""}{mb(part.bytes)}</small>
                  <button type="button" aria-label="Yuqoriga" disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
                  <button type="button" aria-label="Pastga" disabled={busy || index === parts.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
                  <button type="button" aria-label="Qismni olib tashlash" disabled={busy} onClick={() => setParts((prev) => prev.filter((p) => p.key !== part.key))}><Trash2 size={15} /></button>
                </li>
              ))}
            </ol>
          )}

          <label className="book-editor-active">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <Sparkles size={16} /> Haftaning kitobi (bosh sahifada ko‘rinadi)
          </label>

          {isAdmin && active && (
            <fieldset className="book-editor-talk" disabled={busy}>
              <legend><CalendarClock size={16} /> Suhbat vaqti</legend>
              {existingTalk && (
                <p className="book-editor-talk-note">
                  Belgilangan: {dayMonth(new Date(existingTalk.scheduledAt))}, {WEEKDAYS[new Date(existingTalk.scheduledAt).getDay()]}, {clock(new Date(existingTalk.scheduledAt))} — «{existingTalk.title}». Yana biri kerak bo‘lsa, pastda tanlang.
                </p>
              )}
              <input
                type="datetime-local"
                aria-label="Suhbat sanasi va vaqti"
                min={localInput(new Date())}
                value={talkWhen}
                onChange={(e) => setTalkWhen(e.target.value)}
              />
              {talkWhen && (
                <>
                  <input aria-label="Suhbat sarlavhasi" placeholder="Suhbat sarlavhasi" maxLength={200} value={talkTitle} onChange={(e) => setTalkTitle(e.target.value)} />
                  <label className="book-editor-announce">
                    <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
                    <Megaphone size={15} /> Bosh sahifada e’lon qilish (yangiliklar va qo‘ng‘iroqcha)
                  </label>
                </>
              )}
              {!talkWhen && !existingTalk && <small>Ixtiyoriy: sanani tanlasangiz, suhbat «Suhbatlar»da va bosh sahifada e’lon qilinadi.</small>}
            </fieldset>
          )}

          {progress && (
            <div className="book-editor-progress" role="status">
              <span>{progress.label} yuklanmoqda… {percent}% · {mb(progress.sent)} / {mb(progress.total)}</span>
              <span className="bar"><i style={{ width: `${percent}%` }} /></span>
              <button type="button" className="text-btn" onClick={() => abortRef.current?.abort()}><X size={14} /> To‘xtatish</button>
            </div>
          )}

          <div className="book-editor-actions">
            {book && <button type="button" className="danger" disabled={busy} onClick={remove}><Trash2 size={16} /> O‘chirish</button>}
            <button type="button" className="ghost" disabled={busy} onClick={onClose}>Bekor qilish</button>
            <button type="submit" className="button" disabled={busy || !title.trim() || !author.trim()}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

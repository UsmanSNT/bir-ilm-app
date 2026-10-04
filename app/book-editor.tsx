"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CalendarClock, Headphones, ImagePlus, Megaphone, Sparkles, Store, Trash2, Upload, X } from "lucide-react";
import { looksLikeMarkdown, stripMarkdown } from "@/lib/markdown";
import { toast } from "sonner";
import DateTimeField from "./datetime-field";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createBook, deleteBook, deleteTrack, notifyCatalogChanged, saveTracks, updateBook, uploadBookMedia } from "@/lib/api/books-client";
import { createLiveSession, fetchLiveSessions, updateLiveSession } from "@/lib/api/live-client";
import { useViewer } from "@/lib/api/roles-client";
import { BOOK_LIMITS, STORE_CATEGORIES, STORE_LIMITS, type Book, type LiveSession } from "@/shared/contract";
import { WEEKDAYS, clock, dayMonth, localInput, nextTalk, notifyTalksChanged, talkAnnouncement, talkRescheduled } from "./talk-format";

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
  kind = "library",
}: {
  book: Book | null;
  open: boolean;
  onClose: () => void;
  /** library — suhbat/kutubxona kitobi (audio, hafta kitobi); store — do'kon mahsuloti (narx, janr, muqova). */
  kind?: "library" | "store";
  /** Yangi kitob «Haftaning kitobi» belgisi bilan ochiladi (bosh sahifadan). */
  asWeekBook?: boolean;
}) {
  return open ? <EditorDialog key={book?.id ?? "new"} book={book} onClose={onClose} asWeekBook={asWeekBook} kind={book?.kind ?? kind} /> : null;
}

function EditorDialog({ book, onClose, asWeekBook, kind }: { book: Book | null; onClose: () => void; asWeekBook: boolean; kind: "library" | "store" }) {
  const store = kind === "store";
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [summary, setSummary] = useState(book?.summary ?? "");
  const [color, setColor] = useState(book?.color ?? COLORS[0]);
  const [price, setPrice] = useState(book?.price ? String(book.price) : "");
  const [pages, setPages] = useState(String(book?.pages ?? 320));
  const [category, setCategory] = useState(book?.category ?? "");
  const [active, setActive] = useState(store ? false : book?.active ?? asWeekBook);
  // Hafta kitobi bilan birga suhbat vaqtini belgilash (faqat admin suhbat yarata oladi).
  const isAdmin = useViewer()?.role === "admin";
  const [talkWhen, setTalkWhen] = useState("");
  const [talkTitle, setTalkTitle] = useState("Birga tahlil qilamiz");
  const [announce, setAnnounce] = useState(true);
  const [existingTalk, setExistingTalk] = useState<LiveSession | null>(null);
  const talkCreated = useRef(false);

  // Kitobning suhbati allaqachon belgilangan bo'lsa — maydonlar uning vaqti bilan to'ladi,
  // saqlanganda yangi suhbat emas, o'shasi o'zgaradi.
  useEffect(() => {
    if (!isAdmin || !book) return;
    fetchLiveSessions().then((list) => {
      const talk = nextTalk(list.filter((s) => s.bookTitle.trim().toLowerCase() === book.title.trim().toLowerCase()));
      if (!talk || talk.bookTitle.trim().toLowerCase() !== book.title.trim().toLowerCase()) return;
      setExistingTalk(talk);
      setTalkWhen(localInput(new Date(talk.scheduledAt)));
      setTalkTitle(talk.title);
    });
  }, [isAdmin, book]);
  const existingPlanned = existingTalk?.status === "planned";
  const whenChanged = !existingTalk || talkWhen !== localInput(new Date(existingTalk.scheduledAt));
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
    if (isAdmin && active && talkWhen && whenChanged && !talkCreated.current && new Date(talkWhen).getTime() <= Date.now()) {
      toast.error("Suhbat vaqti kelajakda bo‘lsin.");
      return;
    }
    setBusy(true);
    abortRef.current = new AbortController();
    try {
      const priceValue = price.trim() ? Number(price) : 0;
      if (!Number.isInteger(priceValue) || priceValue < 0 || priceValue > STORE_LIMITS.maxPrice) throw new Error("Narx butun wonda (₩), 0 dan 10 000 000 gacha bo‘lsin.");
      const pagesValue = Number(pages);
      if (!Number.isInteger(pagesValue) || pagesValue < 1 || pagesValue > 5000) throw new Error("Sahifalar soni 1 dan 5000 gacha bo‘lsin.");
      const base = { title: title.trim(), author: author.trim(), summary: stripMarkdown(summary), color, pages: pagesValue };
      // Do'kon mahsuloti: narx va janr bor, audio/hafta kitobi yo'q. Kutubxona kitobida aksincha.
      const fields = store ? { ...base, price: priceValue, category: category.trim() } : base;
      let saved = book ? await updateBook(book.id, store ? fields : { ...fields, active }) : await createBook({ ...fields, kind });
      if (!book && active && !store) saved = await updateBook(saved.id, { active: true });

      // Suhbat fayllardan oldin saqlanadi: yuklash uzilsa ham suhbat belgilanib qoladi.
      const talkName = talkTitle.trim() || "Birga tahlil qilamiz";
      if (isAdmin && active && talkWhen && !talkCreated.current && existingTalk && existingPlanned) {
        const when = new Date(talkWhen);
        const titleChanged = talkName !== existingTalk.title;
        const bookChanged = saved.title !== existingTalk.bookTitle;
        if (whenChanged || titleChanged || bookChanged) {
          const result = await updateLiveSession(existingTalk.id, {
            ...(whenChanged ? { scheduledAt: when.toISOString() } : {}),
            ...(titleChanged ? { title: talkName } : {}),
            ...(bookChanged ? { bookTitle: saved.title } : {}),
            announcement: announce && whenChanged ? talkRescheduled(saved.title, talkName, when) : undefined,
          });
          if (typeof result === "string") throw new Error(`Kitob saqlandi, lekin suhbat yangilanmadi: ${result}`);
          talkCreated.current = true;
          notifyTalksChanged();
          toast.success(whenChanged ? `Suhbat vaqti o‘zgartirildi: ${dayMonth(when)}, ${clock(when)}` : "Suhbat yangilandi");
        }
      } else if (isAdmin && active && talkWhen && !talkCreated.current && !existingTalk) {
        const when = new Date(talkWhen);
        const talk = await createLiveSession({
          bookTitle: saved.title,
          title: talkName,
          scheduledAt: when.toISOString(),
          announcement: announce ? talkAnnouncement(saved.title, talkName, when) : undefined,
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
        <DialogTitle className="sr-only">{store ? (book ? "Mahsulotni tahrirlash" : "Do‘konga yangi kitob") : book ? "Kitobni tahrirlash" : asWeekBook ? "Yangi hafta kitobi" : "Yangi kitob"}</DialogTitle>
        <DialogDescription className="sr-only">{store ? "Do‘kon mahsuloti: muqova, tavsif va narx." : "Kitob: muqova, tavsif va audio qismlar."}</DialogDescription>
        <form onSubmit={save}>
          <div className="book-editor-top">
            <label className="book-editor-cover" style={{ backgroundColor: color }}>
              {coverShown ? <img src={coverShown} alt="" /> : <span><ImagePlus size={22} />Muqova</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <div className="book-editor-fields">
              <input aria-label="Kitob nomi" placeholder="Kitob nomi" required maxLength={BOOK_LIMITS.title} value={title} onChange={(e) => setTitle(e.target.value)} />
              <input aria-label="Muallif" placeholder="Muallif" required maxLength={BOOK_LIMITS.author} value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
          </div>
          <textarea
            aria-label="Tavsif"
            placeholder="Qisqacha tavsif (ixtiyoriy)"
            rows={3}
            maxLength={BOOK_LIMITS.summary}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onPaste={(e) => {
              // ChatGPT va boshqa joydan ko'chirilgan `##`, `**`, `- ` belgilari darrov oddiy matnga aylanadi.
              const pasted = e.clipboardData.getData("text/plain");
              if (!looksLikeMarkdown(pasted)) return;
              e.preventDefault();
              const el = e.currentTarget;
              const next = (summary.slice(0, el.selectionStart) + stripMarkdown(pasted) + summary.slice(el.selectionEnd)).slice(0, BOOK_LIMITS.summary);
              setSummary(next);
            }}
          />

          {store && <fieldset className="book-editor-store">
            <legend><Store size={16} /> Book Store</legend>
            <label>
              <span>Narx (₩ won)</span>
              <input inputMode="numeric" pattern="[0-9]*" placeholder="Sotilmaydi" value={price} disabled={busy} onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 8))} />
            </label>
            <label>
              <span>Janr</span>
              <input list="book-editor-categories" placeholder="Masalan: Badiiy adabiyot" maxLength={STORE_LIMITS.category} value={category} disabled={busy} onChange={(e) => setCategory(e.target.value)} />
            </label>
            <datalist id="book-editor-categories">
              {STORE_CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </fieldset>}

          <div className="book-editor-row">
            {!store && <label className="book-editor-audio">
              <Headphones size={18} />
              <span>
                <strong>{parts.length ? "Yana audio" : "Audio qo‘shish"}</strong>
                <small>{BOOK_LIMITS.maxTracks} tagacha · jami 1 GB{totalBytes ? ` · hozir ${mb(totalBytes)}` : ""}</small>
              </span>
              <Upload size={16} />
              <input type="file" accept="audio/*" multiple disabled={busy} onChange={(e) => { pickAudio(e.target.files); e.target.value = ""; }} />
            </label>}
              <label className="book-editor-pages">
            <span>Sahifalar soni</span>
            <input inputMode="numeric" pattern="[0-9]*" aria-label="Sahifalar soni" value={pages} disabled={busy} onChange={(e) => setPages(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </label>
          </div>

          {!store && parts.length > 0 && (
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

          {!store && <label className="book-editor-active">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <Sparkles size={16} /> Haftaning kitobi
          </label>}

          {!store && isAdmin && active && (
            <fieldset className="book-editor-talk" disabled={busy}>
              <legend><CalendarClock size={16} /> Suhbat vaqti</legend>
              {existingTalk && !existingPlanned && <p className="book-editor-talk-note">Suhbat boshlangan — vaqti o‘zgarmaydi.</p>}
              <DateTimeField
                label="Suhbat sanasi va vaqti"
                min={localInput(new Date())}
                disabled={Boolean(existingTalk && !existingPlanned)}
                value={talkWhen}
                onChange={setTalkWhen}
              />
              {talkWhen && (
                <>
                  <label className="book-editor-announce">
                    <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
                    <Megaphone size={15} /> {existingTalk ? "Vaqt o‘zgarganini e’lon qilish" : "Bosh sahifada e’lon qilish"}
                  </label>
                </>
              )}
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

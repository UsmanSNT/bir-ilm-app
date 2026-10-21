"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, CalendarClock, Clock3, Eye, FileText, Headphones, ImagePlus, Link2, Megaphone, Sparkles, Store, Trash2, Upload, X } from "lucide-react";
import { looksLikeMarkdown, stripMarkdown } from "@/lib/markdown";
import { toast } from "sonner";
import DateTimeField from "./datetime-field";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { audioDuration, createBook, deleteBook, deleteEbook, deleteTrack, fetchEbook, notifyCatalogChanged, saveEbook, saveTracks, updateBook, uploadBookMedia } from "@/lib/api/books-client";
import { createLiveSession, fetchLiveSessions, updateLiveSession } from "@/lib/api/live-client";
import { useViewer } from "@/lib/api/roles-client";
import { BOOK_LIMITS, EBOOK_LIMITS, STORE_CATEGORIES, STORE_LIMITS, describeAudioLink, normalizeAudioLink, type Book, type LiveSession } from "@/shared/contract";
import { ebookTextLength, tidyEbookSource } from "@/shared/ebook-markup";
import EbookReader from "./ebook-reader";
import { clock, dayMonth, durationLabel, localInput, nextTalk, notifyTalksChanged, talkAnnouncement, talkRescheduled } from "./talk-format";

const COLORS = ["#0f4f45", "#294256", "#7a3b2e", "#5b4a8b", "#8a6511", "#2f6f8f", "#374151"];

/** Muqovasi yo'q kitobning foni: yangi kitobda nomidan tanlanadi (javonda kitoblar har xil rangda tursin). */
function colorFor(title: string) {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function mb(bytes: number) {
  return bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.max(0.1, bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Audiokitob qismi: yuklangani (`id`) yoki endi yuklanadigan fayl (`file`). */
type Part = { key: string; id?: string; title: string; bytes: number; seconds: number; file?: File };

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
  const color = book?.color ?? colorFor(title.trim());
  const [author, setAuthor] = useState(book?.author ?? "");
  const [summary, setSummary] = useState(book?.summary ?? "");
  const [price, setPrice] = useState(book?.price ? String(book.price) : "");
  // Bo'sh qoldirilsa 0 saqlanadi va hech qayerda ko'rsatilmaydi.
  const [pages, setPages] = useState(book?.pages ? String(book.pages) : "");
  const [audioLink, setAudioLink] = useState(book?.audioLink ?? "");
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
  const [parts, setParts] = useState<Part[]>(() => (book?.tracks ?? []).map((t) => ({ key: t.id, id: t.id, title: t.title, bytes: t.bytes, seconds: t.seconds })));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ label: string; sent: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Elektron kitob: `ebookText` null — o'zgartirilmagan (serverdagisi qoladi).
  const [ebookText, setEbookText] = useState<string | null>(null);
  const [ebookLoaded, setEbookLoaded] = useState<string | null>(null);
  const [ebookRemoved, setEbookRemoved] = useState(false);
  const [ebookOpen, setEbookOpen] = useState(false);
  const [ebookWork, setEbookWork] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const ebookChars = useMemo(() => (ebookText === null ? 0 : ebookTextLength(ebookText)), [ebookText]);
  const ebookDirty = ebookText !== null && ebookText !== ebookLoaded;

  /** Serverdagi matnni tahrirlash uchun bir marta yuklaydi. */
  async function openEbookText() {
    setEbookOpen(true);
    if (ebookText !== null || !book?.ebook || ebookRemoved) return;
    setEbookWork("Matn yuklanmoqda…");
    try {
      const current = await fetchEbook(book.id);
      if (!current.full) throw new Error("To‘liq matnni olib bo‘lmadi.");
      setEbookLoaded(current.body);
      setEbookText(current.body);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Matn yuklanmadi.");
    } finally {
      setEbookWork("");
    }
  }

  /** PDF (matnli), TXT yoki MD fayldan matn. PDF brauzerning o'zida o'qiladi. */
  async function importEbook(file?: File) {
    if (!file) return;
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const text = /^text\//.test(file.type) || /\.(txt|md|markdown)$/i.test(file.name);
    if (!pdf && !text) return toast.error("PDF, TXT yoki MD fayl tanlang.");
    if (file.size > EBOOK_LIMITS.pdfBytes) return toast.error("Fayl 100 MB dan oshmasin.");
    setEbookWork(pdf ? "PDF o‘qilmoqda…" : "Fayl o‘qilmoqda…");
    try {
      const body = pdf
        ? await (await import("./pdf-to-ebook")).pdfToEbook(file, (page, total) => setEbookWork(`PDF o‘qilmoqda… ${page}/${total} sahifa`))
        : tidyEbookSource(await file.text());
      if (!ebookTextLength(body)) throw new Error("Faylda matn topilmadi.");
      if (body.length > EBOOK_LIMITS.bodyChars) throw new Error("Matn juda katta (2 mln belgidan oshmasin).");
      setEbookText(body);
      setEbookRemoved(false);
      setEbookOpen(true);
      toast.success(pdf ? "PDF matnga aylantirildi. Sarlavha va she’rlarni tekshirib, «Saqlash»ni bosing." : "Matn olindi. Tekshirib, «Saqlash»ni bosing.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Faylni o‘qib bo‘lmadi.");
    } finally {
      setEbookWork("");
    }
  }

  const preview = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pickCover(file?: File) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast.error("Muqova JPG, PNG yoki WEBP bo‘lsin.");
    if (file.size > BOOK_LIMITS.coverBytes) return toast.error("Muqova 5 MB dan oshmasin.");
    setCover(file);
  }

  const totalBytes = parts.reduce((sum, p) => sum + p.bytes, 0);
  const totalSeconds = parts.reduce((sum, p) => sum + p.seconds, 0);
  const linkInfo = describeAudioLink(audioLink);

  async function pickAudio(list: FileList | null) {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("audio/")).sort(byName);
    if (!files.length) return toast.error("Audio fayl tanlang (MP3, M4A, OGG, WAV, FLAC).");
    if (parts.length + files.length > BOOK_LIMITS.maxTracks) return toast.error(`Audiokitob ${BOOK_LIMITS.maxTracks} qismdan oshmasin.`);
    const added = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes + added > BOOK_LIMITS.audioBytes) return toast.error(`Barcha qismlar jami 1 GB dan oshmasin (bo‘ladi: ${mb(totalBytes + added)}).`);
    const seconds = await Promise.all(files.map(audioDuration));
    setParts((prev) => [...prev, ...files.map((file, index) => ({ key: `${file.name}-${file.size}-${Math.random()}`, title: titleOf(file), bytes: file.size, seconds: seconds[index], file }))]);
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
      const pagesValue = pages.trim() ? Number(pages) : 0;
      if (!Number.isInteger(pagesValue) || pagesValue < 0 || pagesValue > 5000) throw new Error("Sahifalar soni 1 dan 5000 gacha bo‘lsin (yoki bo‘sh qoldiring).");
      const linkValue = audioLink.trim();
      if (!store && linkValue && !normalizeAudioLink(linkValue)) throw new Error("Audio havolasi noto‘g‘ri. Masalan: https://youtu.be/… yoki https://t.me/…");
      const base = { title: title.trim(), author: author.trim(), summary: stripMarkdown(summary), color, pages: pagesValue };
      // Do'kon mahsuloti: narx va janr bor, audio/hafta kitobi yo'q. Kutubxona kitobida aksincha.
      const fields = store ? { ...base, price: priceValue, category: category.trim() } : { ...base, audioLink: linkValue };
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

      // E-kitob matni — katta fayllardan oldin (yuklash uzilsa ham matn saqlanib qoladi).
      if (ebookRemoved && book?.ebook) saved = await deleteEbook(saved.id);
      else if (!ebookRemoved && ebookDirty && ebookText?.trim()) {
        saved = await saveEbook(saved.id, ebookText);
        setEbookLoaded(ebookText);
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
    <>
    {/* Ko'rib chiqishda oyna vaqtincha yopiladi (holat saqlanadi), o'qish oynasi butun ekranni oladi. */}
    {previewing && ebookText !== null && (
      <EbookReader
        book={{ id: book?.id ?? "draft", title: title.trim() || "Nomsiz kitob", author: author.trim(), coverUrl: preview ?? book?.coverUrl ?? null, color }}
        draft={ebookText}
        onClose={() => setPreviewing(false)}
      />
    )}
    <Dialog open={!previewing} onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
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

          {!store && (
            <section className="book-editor-audio-card" aria-label="Audio">
              <label className="book-editor-upload">
                <span className="book-editor-upload-icon" aria-hidden="true"><Headphones size={22} /></span>
                <span className="book-editor-upload-text">
                  <strong>{parts.length ? "Yana audio qo‘shish" : "Audio yuklash"}</strong>
                  <small>MP3, M4A, OGG, WAV · {BOOK_LIMITS.maxTracks} qismgacha · jami 1 GB</small>
                </span>
                <span className="book-editor-upload-btn"><Upload size={15} /> Tanlash</span>
                <input type="file" accept="audio/*" multiple disabled={busy} onChange={(e) => { pickAudio(e.target.files); e.target.value = ""; }} />
              </label>

              {parts.length > 0 && (
                <p className="book-editor-summary" aria-live="polite">
                  <Clock3 size={15} />
                  {parts.length} qism{totalSeconds > 0 ? ` · ${durationLabel(totalSeconds)}` : ""} · {mb(totalBytes)}
                </p>
              )}

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

              <div className="book-editor-or"><span>yoki havola</span></div>
              <label className="book-editor-link">
                <Link2 size={16} aria-hidden="true" />
                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-label="Audio havolasi"
                  placeholder="YouTube, Telegram yoki boshqa havola"
                  maxLength={2048}
                  value={audioLink}
                  disabled={busy}
                  onChange={(e) => setAudioLink(e.target.value)}
                />
              </label>
              {linkInfo ? (
                <p className="book-editor-link-hint is-ok">
                  <b>{linkInfo.label}</b> · {linkInfo.display}
                  {parts.length > 0 && <em> — audio yuklangani uchun havola ishlatilmaydi</em>}
                </p>
              ) : audioLink.trim() ? (
                <p className="book-editor-link-hint is-bad" role="alert">Havola noto‘g‘ri. Masalan: youtu.be/… yoki t.me/…</p>
              ) : (
                <p className="book-editor-link-hint">Audio yuklanmasa, «Eshitish» tugmasi shu havolaga olib boradi.</p>
              )}
            </section>
          )}

          <section className="book-editor-audio-card book-editor-ebook" aria-label="Elektron kitob">
            <label className="book-editor-upload">
              <span className="book-editor-upload-icon is-ebook" aria-hidden="true"><BookOpen size={22} /></span>
              <span className="book-editor-upload-text">
                <strong>Elektron kitob</strong>
                <small aria-live="polite">
                  {ebookWork
                    || (ebookRemoved
                      ? "Saqlanganda olib tashlanadi"
                      : ebookText !== null
                        ? `${ebookChars.toLocaleString("ru-RU")} belgi · ≈${Math.max(1, Math.round(ebookChars / 1800))} bet${ebookDirty ? " · saqlanmagan" : ""}`
                        : book?.ebook
                          ? `Qo‘yilgan · ≈${Math.max(1, Math.round(book.ebook.chars / 1800))} bet`
                          : "Matnli PDF, TXT yoki MD · matnni joylash ham mumkin")}
                </small>
              </span>
              <span className="book-editor-upload-btn"><Upload size={15} /> PDF / matn</span>
              <input type="file" accept="application/pdf,.pdf,text/plain,.txt,.md,text/markdown" disabled={busy || Boolean(ebookWork)} onChange={(e) => { void importEbook(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {store && <p className="book-editor-link-hint">Do‘konda hamma faqat boshlang‘ich qismini (≈10%) o‘qiy oladi.</p>}
            <div className="book-editor-ebook-tools">
              <button type="button" className="ghost" disabled={busy || Boolean(ebookWork)} aria-expanded={ebookOpen} onClick={() => (ebookOpen ? setEbookOpen(false) : void openEbookText())}>
                <FileText size={15} /> {ebookOpen ? "Matnni yopish" : book?.ebook || ebookText !== null ? "Matnni tahrirlash" : "Matnni yozish yoki joylash"}
              </button>
              {ebookText !== null && ebookChars > 0 && !ebookRemoved && (
                <button type="button" className="ghost" disabled={busy} onClick={() => setPreviewing(true)}><Eye size={15} /> Ko‘rib chiqish</button>
              )}
              {(book?.ebook || ebookText !== null) && !ebookRemoved && (
                <button type="button" className="ghost is-danger" disabled={busy} onClick={() => { setEbookRemoved(true); setEbookText(null); setEbookOpen(false); }}><Trash2 size={15} /> Olib tashlash</button>
              )}
              {ebookRemoved && <button type="button" className="ghost" onClick={() => setEbookRemoved(false)}>Qaytarish</button>}
            </div>
            {ebookOpen && !ebookRemoved && (
              <>
                <textarea
                  className="book-editor-ebook-text"
                  aria-label="Elektron kitob matni"
                  placeholder={"# Bob nomi\n\nXatboshi matni…"}
                  rows={12}
                  spellCheck={false}
                  disabled={busy || Boolean(ebookWork)}
                  value={ebookText ?? ""}
                  onChange={(e) => { setEbookText(e.target.value); setEbookRemoved(false); }}
                />
                <details className="book-editor-ebook-help">
                  <summary>Belgilash qoidalari</summary>
                  <ul>
                    <li><code># Bob</code> — yangi sahifadan boshlanadi, mundarijaga kiradi; <code>## Bo‘lim</code> — mundarijaga kiradi; <code>### Kichik sarlavha</code></li>
                    <li>Har bir qator — alohida xatboshi.</li>
                    <li><code>&gt; she’r qatori</code> — she’r; bo‘sh qator bandlarni ajratadi.</li>
                    <li><code>-&gt; matn &lt;-</code> — o‘rtada; <code>-&gt; imzo</code> — o‘ngda; <code>---</code> — yangi sahifa.</li>
                    <li><code>**qalin**</code>, <code>*kursiv*</code>. o‘ va g‘ uchun oddiy <code>&apos;</code> yozsangiz bo‘ladi.</li>
                  </ul>
                </details>
              </>
            )}
          </section>
          <label className="book-editor-pages">
            <span>Sahifalar soni <small>ixtiyoriy</small></span>
            <input inputMode="numeric" pattern="[0-9]*" placeholder="—" aria-label="Sahifalar soni (ixtiyoriy)" value={pages} disabled={busy} onChange={(e) => setPages(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </label>

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
    </>
  );
}

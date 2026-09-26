"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Headphones, ImagePlus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createBook, deleteBook, notifyCatalogChanged, updateBook, uploadBookMedia } from "@/lib/api/books-client";
import { BOOK_LIMITS, type Book } from "@/shared/contract";

const COLORS = ["#0f4f45", "#294256", "#7a3b2e", "#5b4a8b", "#8a6511", "#2f6f8f", "#374151"];

function mb(bytes: number) {
  return bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.max(0.1, bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Kitob qo'shish/tahrirlash (admin va moderator). `book` bo'lmasa — yangi kitob. */
export default function BookEditor({ book, open, onClose }: { book: Book | null; open: boolean; onClose: () => void }) {
  return open ? <EditorDialog key={book?.id ?? "new"} book={book} onClose={onClose} /> : null;
}

function EditorDialog({ book, onClose }: { book: Book | null; onClose: () => void }) {
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [summary, setSummary] = useState(book?.summary ?? "");
  const [color, setColor] = useState(book?.color ?? COLORS[0]);
  const [active, setActive] = useState(book?.active ?? false);
  const [cover, setCover] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
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

  function pickAudio(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) return toast.error("Audio fayl tanlang (MP3, M4A, OGG, WAV, FLAC).");
    if (file.size > BOOK_LIMITS.audioBytes) return toast.error(`Audio 1 GB dan oshmasin (tanlangan: ${mb(file.size)}).`);
    setAudio(file);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    abortRef.current = new AbortController();
    try {
      const fields = { title: title.trim(), author: author.trim(), summary: summary.trim(), color };
      let saved = book ? await updateBook(book.id, { ...fields, active }) : await createBook(fields);
      if (!book && active) saved = await updateBook(saved.id, { active: true });

      for (const [kind, file] of [["cover", cover], ["audio", audio]] as const) {
        if (!file) continue;
        const label = kind === "cover" ? "Muqova" : "Audio";
        setProgress({ label, sent: 0, total: file.size });
        saved = await uploadBookMedia(saved.id, kind, file, (sent, total) => setProgress({ label, sent, total }), abortRef.current.signal);
      }
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
        <DialogTitle>{book ? "Kitobni tahrirlash" : "Yangi kitob"}</DialogTitle>
        <DialogDescription>Audiokitob, muqova va tavsif. Faqat admin va moderator ko‘radi.</DialogDescription>
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
              <strong>{audio ? audio.name : book?.audioUrl ? "Audio yuklangan — almashtirish" : "Audiokitob faylini tanlang"}</strong>
              <small>{audio ? mb(audio.size) : "MP3, M4A, OGG, WAV, FLAC · 1 GB gacha"}</small>
            </span>
            <Upload size={16} />
            <input type="file" accept="audio/*" disabled={busy} onChange={(e) => { pickAudio(e.target.files?.[0]); e.target.value = ""; }} />
          </label>

          <label className="book-editor-active">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <Sparkles size={16} /> Haftaning kitobi (bosh sahifada ko‘rinadi)
          </label>

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

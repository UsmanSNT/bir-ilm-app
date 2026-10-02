"use client";

/**
 * Post yoki maqola yozish (va tahrirlash) oynasi.
 *
 * Tepada — albom (10 tagacha rasm/video), so'ng maqola sarlavhasi, kitob tegi
 * va formatlangan matn. Fayllar tanlanishi bilan fonda yuklanadi.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, ImagePlus, Loader2, Megaphone, Newspaper, RotateCcw, Send, StickyNote, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { COMMUNITY_LIMITS, type MediaItem, type PostFormat } from "@/shared/contract/community";
import type { ReadingPost } from "../social-types";
import { RichEditor, type RichEditorHandle } from "./editor";
import { mediaSrc } from "./rich-text";
import { LoginRequiredError, MEDIA_ACCEPT, apiCall, uploadMedia } from "./upload";

/** Sarlavha maydoni matnga qarab o'sadi (tahrirlashda uzun sarlavha ham to'liq ko'rinsin). */
function fitHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

type Slot = { key: string; kind: "image" | "video"; preview: string; item?: MediaItem; progress: number; error?: string; file?: File };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tahrirlanayotgan post (to'liq — `content` bilan). */
  editing?: ReadingPost | null;
  moderator: boolean;
  onPublished: (id: string, edited: boolean) => void;
  onLoginRequired: () => void;
};

export function Composer({ open, onOpenChange, editing, moderator, onPublished, onLoginRequired }: Props) {
  // Yopilganda tana o'chadi — keyingi ochilishda muharrir toza boshlanadi.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ComposerBody key={editing?.id ?? "new"} editing={editing} moderator={moderator} onClose={() => onOpenChange(false)} onPublished={onPublished} onLoginRequired={onLoginRequired} />}
    </Dialog>
  );
}

function ComposerBody({ editing, moderator, onClose, onPublished, onLoginRequired }: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
  const editor = useRef<RichEditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<PostFormat>(editing?.format ?? "post");
  const [announce, setAnnounce] = useState(editing?.kind === "announcement");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [book, setBook] = useState(editing?.book ?? "");
  const [length, setLength] = useState(editing?.body.length ?? 0);
  const [inlinePending, setInlinePending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [slots, setSlots] = useState<Slot[]>(() =>
    (editing?.attachments ?? []).flatMap((id) => {
      const item = editing?.media.find((m) => m.id === id);
      return item ? [{ key: item.id, kind: item.kind, preview: mediaSrc(item), item, progress: 1 }] : [];
    }),
  );

  const limit = format === "article" ? COMMUNITY_LIMITS.articleText : COMMUNITY_LIMITS.postText;
  const uploading = slots.some((slot) => !slot.item && !slot.error) || inlinePending > 0;
  const needsTitle = format === "article" || announce;

  const patch = (key: string, value: Partial<Slot>) => setSlots((list) => list.map((slot) => (slot.key === key ? { ...slot, ...value } : slot)));

  const start = useCallback((slot: Slot) => {
    if (!slot.file) return;
    uploadMedia(slot.file, (progress) => patch(slot.key, { progress }))
      .then((item) => patch(slot.key, { item, progress: 1, error: undefined }))
      .catch((error: unknown) => {
        if (error instanceof LoginRequiredError) {
          setSlots((list) => list.filter((s) => s.key !== slot.key));
          onLoginRequired();
          return;
        }
        patch(slot.key, { error: error instanceof Error ? error.message : "Yuklanmadi." });
      });
  }, [onLoginRequired]);

  // Oyna yopilganda vaqtinchalik ko'rinish havolalarini bo'shatamiz.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const addFiles = (files: File[]) => {
    const media = files.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    const room = COMMUNITY_LIMITS.attachments - slots.length;
    if (media.length > room) toast(`Tepaga ${COMMUNITY_LIMITS.attachments} tagacha rasm/video qo'yiladi.`);
    const added = media.slice(0, Math.max(0, room)).map<Slot>((file) => ({
      key: crypto.randomUUID(),
      kind: file.type.startsWith("video/") ? "video" : "image",
      preview: URL.createObjectURL(file),
      progress: 0,
      file,
    }));
    if (!added.length) return;
    added.forEach((slot) => previews.current.add(slot.preview));
    setSlots((list) => [...list, ...added]);
    setDirty(true);
    added.forEach(start);
  };

  const remove = (key: string) => {
    setSlots((list) => list.filter((slot) => slot.key !== key));
    setDirty(true);
  };

  const move = (key: string, step: number) => setSlots((list) => {
    const i = list.findIndex((slot) => slot.key === key);
    const j = i + step;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const close = () => {
    if ((dirty || length > 0) && !busy && !window.confirm("Yozganlaringiz saqlanmaydi. Yopilsinmi?")) return;
    onClose();
  };

  const publish = async () => {
    if (busy) return;
    if (uploading) { toast("Fayllar yuklanib bo'lishini kuting."); return; }
    if (needsTitle && !title.trim()) { toast.error(announce ? "E'lon sarlavhasini yozing." : "Maqola sarlavhasini yozing."); return; }
    const content = editor.current?.getDoc() ?? [];
    const attachments = slots.flatMap((slot) => (slot.item ? [slot.item.id] : []));
    if (!content.length && !attachments.length) { toast.error("Matn yozing yoki rasm/video qo'shing."); return; }
    setBusy(true);
    try {
      const input = { format, kind: announce ? "announcement" : "post", title: needsTitle ? title.trim() : "", book: book.trim(), content, attachments };
      const result = editing
        ? await apiCall<{ id: string }>(`/community/posts/${editing.id}`, { method: "PUT", body: JSON.stringify(input) })
        : await apiCall<{ id: string }>("/community/posts", { method: "POST", body: JSON.stringify(input) });
      onPublished(result.id, Boolean(editing));
      onClose();
    } catch (error) {
      if (error instanceof LoginRequiredError) onLoginRequired();
      else toast.error(error instanceof Error ? error.message : "Saqlanmadi.");
    } finally {
      setBusy(false);
    }
  };

  const heading = editing ? "Tahrirlash" : announce ? "E'lon yozish" : format === "article" ? "Maqola yozish" : "Post yozish";

  return (
    <DialogContent
      className="post-composer"
      showCloseButton={false}
      onEscapeKeyDown={(e) => { e.preventDefault(); close(); }}
      onPointerDownOutside={(e) => e.preventDefault()}
      onInteractOutside={(e) => e.preventDefault()}
    >
      <header className="composer-head">
        <button type="button" className="icon-btn" onClick={close} aria-label="Yopish" title="Yopish"><X size={22} /></button>
        <DialogTitle>{heading}</DialogTitle>
        <button type="button" className="button composer-publish" onClick={() => void publish()} disabled={busy || uploading || length > limit}>
          {busy ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
          {editing ? "Saqlash" : "Joylash"}
        </button>
      </header>
      <DialogDescription className="sr-only">Matn, rasm va video bilan post yoki maqola yozing.</DialogDescription>

      <div className="composer-scroll">
        <div className="composer-modes" role="radiogroup" aria-label="Turi">
          <button type="button" role="radio" aria-checked={format === "post"} onClick={() => setFormat("post")}><StickyNote size={16} />Post</button>
          <button type="button" role="radio" aria-checked={format === "article"} onClick={() => setFormat("article")}><Newspaper size={16} />Maqola</button>
          {moderator && (
            <label className="announce-toggle"><input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} /><Megaphone size={16} />E&apos;lon</label>
          )}
        </div>

        <section className={`composer-album count-${Math.min(slots.length, 10)}`} aria-label="Rasm va videolar">
          {slots.map((slot, i) => (
            <div className={`composer-slot${slot.error ? " has-error" : ""}`} key={slot.key}>
              {slot.kind === "video"
                ? <video src={slot.item ? `${mediaSrc(slot.item)}#t=0.1` : slot.preview} muted playsInline preload="metadata" />
                : <img src={slot.item ? mediaSrc(slot.item) : slot.preview} alt="" />}
              {!slot.item && !slot.error && <span className="composer-progress"><i style={{ width: `${Math.round(slot.progress * 100)}%` }} /></span>}
              {slot.error && (
                <button type="button" className="composer-retry" onClick={() => { patch(slot.key, { error: undefined, progress: 0 }); start(slot); }} title={slot.error}>
                  <RotateCcw size={16} />Qayta
                </button>
              )}
              <div className="composer-slot-tools">
                {slots.length > 1 && i > 0 && <button type="button" onClick={() => move(slot.key, -1)} aria-label="Oldinga surish">‹</button>}
                {slots.length > 1 && i < slots.length - 1 && <button type="button" onClick={() => move(slot.key, 1)} aria-label="Orqaga surish">›</button>}
                <button type="button" onClick={() => remove(slot.key)} aria-label="Olib tashlash"><X size={15} /></button>
              </div>
            </div>
          ))}
          {slots.length < COMMUNITY_LIMITS.attachments && (
            <button type="button" className={`composer-add${slots.length ? "" : " is-empty"}`} onClick={() => fileInput.current?.click()}>
              <ImagePlus size={slots.length ? 22 : 28} />
              {!slots.length && <span><strong>Rasm yoki video qo&apos;shing</strong><small>Tepada chiqadi · {COMMUNITY_LIMITS.attachments} tagacha · video 300 MB gacha</small></span>}
            </button>
          )}
          <input ref={fileInput} type="file" accept={MEDIA_ACCEPT} multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </section>

        {needsTitle && (
          <textarea
            className="composer-title"
            rows={1}
            placeholder={announce ? "E'lon sarlavhasi" : "Maqola sarlavhasi"}
            maxLength={COMMUNITY_LIMITS.title}
            value={title}
            aria-label="Sarlavha"
            ref={fitHeight}
            onChange={(e) => { setTitle(e.target.value.replace(/\n/g, " ")); setDirty(true); fitHeight(e.target); }}
          />
        )}
        {!announce && (
          <label className="composer-book">
            <BookOpen size={16} />
            <input placeholder="Qaysi kitob haqida? (ixtiyoriy)" maxLength={COMMUNITY_LIMITS.book} value={book} onChange={(e) => { setBook(e.target.value); setDirty(true); }} aria-label="Kitob nomi" />
          </label>
        )}

        <RichEditor
          ref={editor}
          initial={editing?.content ?? null}
          media={editing?.media}
          article={format === "article"}
          placeholder={format === "article" ? "Maqolangizni yozing… Matnni belgilab formatlang, rasm/videoni matn orasiga qo'ying." : "Fikringiz, taassurot yoki iqtibos…"}
          onChange={setLength}
          onPendingChange={setInlinePending}
          onLoginRequired={onLoginRequired}
        />
      </div>

      <footer className="composer-foot">
        <span className={length > limit ? "is-over" : ""}>{length.toLocaleString("ru-RU")} / {limit.toLocaleString("ru-RU")}</span>
        <span className="composer-hint">Matnni belgilang — qalin, kursiv, spoiler, havola…</span>
      </footer>
    </DialogContent>
  );
}

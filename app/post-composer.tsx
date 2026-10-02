"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ImagePlus, Minus, Palette, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import DesignCard from "./design-card";
import { books } from "./app-data";
import { kindLabels } from "./post-card";
import { postKinds, type PostKind } from "./social-types";
import { backgrounds, fonts, MAX_CARD_TEXT, MAX_STICKERS, stickers, type Background, type FontId, type PostDesign } from "./post-design";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, type MediaType } from "./media-rules";

const fontLabels: Record<FontId, string> = { serif: "Klassik", sans: "Zamonaviy", mono: "Mashinka" };

/** Faylni xom tana sifatida yuklaydi; XHR yuklash foizini ko'rsatish uchun. */
function upload(file: File, onProgress: (p: number) => void): Promise<{ key: string; type: MediaType }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data: { key?: string; type?: MediaType; error?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* bo'sh javob */ }
      if (xhr.status === 200 && data.key && data.type) resolve({ key: data.key, type: data.type });
      else reject(Error(data.error ?? "Fayl yuklanmadi."));
    };
    xhr.onerror = () => reject(Error("Tarmoq xatosi. Qayta urinib ko‘ring."));
    xhr.send(file);
  });
}

export default function PostComposer({ submit, onDone }: { submit: (payload: Record<string, unknown>) => Promise<void>; onDone: () => void }) {
  const [mode, setMode] = useState<"card" | "media">("card");
  const [design, setDesign] = useState<PostDesign>({ bg: "emerald", font: "serif", text: "", stickers: [] });
  const [selected, setSelected] = useState(-1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [book, setBook] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<PostKind>("quote");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const isImage = f.type.startsWith("image/"), isVideo = f.type.startsWith("video/");
    if (!isImage && !isVideo) return toast.error("Faqat rasm yoki video tanlang.");
    if (f.size > (isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) return toast.error(isImage ? "Rasm 8 MB dan oshmasin." : "Video 40 MB dan oshmasin.");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const addSticker = (e: string) => setDesign(d => {
    if (d.stickers.length >= MAX_STICKERS) return d;
    const n = d.stickers.length;
    setSelected(n);
    return { ...d, stickers: [...d.stickers, { e, x: 22 + ((n * 17) % 56), y: 18 + ((n * 23) % 60), s: 1 }] };
  });
  const updateSticker = (i: number, patch: Partial<PostDesign["stickers"][number]>) =>
    setDesign(d => ({ ...d, stickers: d.stickers.map((s, j) => j === i ? { ...s, ...patch } : s) }));

  const ready = mode === "card" ? !!(design.text.trim() || design.stickers.length) : !!file;
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      const base = { type: "post", book: book.trim(), body: body.trim(), kind };
      if (mode === "media" && file) {
        setProgress(0);
        const media = await upload(file, setProgress);
        await submit({ ...base, mediaKey: media.key });
      } else {
        await submit({ ...base, design: { ...design, text: design.text.trim() } });
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Post saqlanmadi.");
    } finally { setBusy(false); }
  };

  const sel = design.stickers[selected];
  return <form className="ig-composer-form" onSubmit={e => void onSubmit(e)}>
    <div className="ig-segment" role="tablist" aria-label="Post turi">
      <button type="button" role="tab" aria-selected={mode === "card"} onClick={() => setMode("card")}><Palette size={17} />Karta yasash</button>
      <button type="button" role="tab" aria-selected={mode === "media"} onClick={() => setMode("media")}><ImagePlus size={17} />Rasm / video</button>
    </div>

    {mode === "card" ? <>
      <DesignCard design={design} selected={selected} placeholder="Matn yozing yoki stiker qo‘shing"
        onSelectSticker={setSelected} onMoveSticker={(i, x, y) => updateSticker(i, { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) })} />
      <textarea className="ig-card-text" aria-label="Karta matni" rows={2} maxLength={MAX_CARD_TEXT} value={design.text} onChange={e => setDesign(d => ({ ...d, text: e.target.value }))} placeholder="Kitobdan iqtibos yoki fikr..." />
      <div className="ig-tool-row" aria-label="Fon rangi">{(Object.keys(backgrounds) as Background[]).map(bg => <button type="button" key={bg} className="ig-swatch" aria-label={`Fon: ${bg}`} aria-pressed={design.bg === bg} style={{ background: backgrounds[bg] }} onClick={() => setDesign(d => ({ ...d, bg }))} />)}</div>
      <div className="ig-tool-row" aria-label="Shrift">{(Object.keys(fonts) as FontId[]).map(f => <button type="button" key={f} className="ig-font" aria-pressed={design.font === f} style={{ fontFamily: fonts[f] }} onClick={() => setDesign(d => ({ ...d, font: f }))}>{fontLabels[f]}</button>)}</div>
      <div className="ig-stickers" aria-label="Stikerlar">{stickers.map(s => <button type="button" key={s} aria-label={`Stiker qo‘shish ${s}`} disabled={design.stickers.length >= MAX_STICKERS} onClick={() => addSticker(s)}>{s}</button>)}</div>
      {sel && <div className="ig-sticker-tools"><span>{sel.e} tanlangan · sudrab joylang</span>
        <button type="button" aria-label="Kichraytirish" onClick={() => updateSticker(selected, { s: Math.max(0.6, sel.s - 0.2) })}><Minus size={16} /></button>
        <button type="button" aria-label="Kattalashtirish" onClick={() => updateSticker(selected, { s: Math.min(2.5, sel.s + 0.2) })}><Plus size={16} /></button>
        <button type="button" aria-label="Stikerni o‘chirish" onClick={() => { setDesign(d => ({ ...d, stickers: d.stickers.filter((_, j) => j !== selected) })); setSelected(-1); }}><Trash2 size={16} /></button>
      </div>}
    </> : <>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm" hidden onChange={e => pick(e.target.files?.[0])} />
      {file && preview
        ? <div className="ig-media-preview">
            {file.type.startsWith("video/") ? <video src={preview} controls playsInline muted /> : (
              // eslint-disable-next-line @next/next/no-img-element -- lokal blob: URL, next/image optimizatsiyasi qo'llanmaydi
              <img src={preview} alt="Tanlangan rasm" />)}
            <button type="button" className="ig-media-clear" aria-label="Faylni olib tashlash" onClick={() => { setFile(null); setPreview(""); if (input.current) input.current.value = ""; }}><X size={18} /></button>
          </div>
        : <button type="button" className="ig-drop" onClick={() => input.current?.click()}><ImagePlus size={40} strokeWidth={1.4} /><strong>Rasm yoki video tanlang</strong><span>JPG, PNG, WEBP, GIF — 8 MB gacha · MP4, MOV, WEBM — 40 MB gacha</span></button>}
    </>}

    <div className="kind-picker" role="radiogroup" aria-label="Mazmun turi">{postKinds.map(k => <button type="button" key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{kindLabels[k]}</button>)}</div>
    <input className="ig-input" aria-label="Kitob nomi" list="catalog-titles" placeholder="Qaysi kitob haqida? (ixtiyoriy)" maxLength={160} value={book} onChange={e => setBook(e.target.value)} />
    <datalist id="catalog-titles">{books.map(b => <option key={b.id} value={b.title} />)}</datalist>
    <textarea className="ig-input" aria-label="Izoh (caption)" placeholder="Izoh yozing..." maxLength={2000} rows={3} value={body} onChange={e => setBody(e.target.value)} />
    <div className="compose-footer"><span>{busy && mode === "media" ? `Yuklanmoqda: ${progress}%` : `${body.length}/2000`}</span>
      <button className="button" disabled={busy || !ready}><Send size={17} />{busy ? "Joylanmoqda..." : "Ulashish"}</button></div>
  </form>;
}

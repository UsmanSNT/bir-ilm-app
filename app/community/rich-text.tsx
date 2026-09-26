"use client";

/**
 * Formatlangan matnni React elementlariga aylantiradi. HTML ishlatilmaydi —
 * shuning uchun post orqali skript kiritib bo'lmaydi.
 */
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { absoluteUrl } from "@/lib/api/config";
import { isSafeHref, type Block, type Doc, type InlineText, type MediaItem } from "@/shared/contract/community";

const URL_PATTERN = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g;

function withBreaks(text: string, key: string): ReactNode[] {
  return text.split("\n").flatMap((line, i) => (i ? [<br key={`${key}-br${i}`} />, line] : [line]));
}

/** Oddiy matndagi havolalarni bosiladigan qiladi (Telegram kabi). */
function autolink(text: string, key: string): ReactNode[] {
  const parts = text.split(URL_PATTERN);
  return parts.flatMap((part, i): ReactNode[] =>
    i % 2 === 1
      ? [<a key={`${key}-l${i}`} href={part} target="_blank" rel="noopener noreferrer nofollow ugc">{part}</a>]
      : withBreaks(part, `${key}-t${i}`),
  );
}

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <span
      className={`rt-spoiler${shown ? " is-shown" : ""}`}
      role={shown ? undefined : "button"}
      tabIndex={shown ? undefined : 0}
      aria-label={shown ? undefined : "Yashirin matn — ko'rish uchun bosing"}
      onClick={(e) => { if (!shown) { e.preventDefault(); e.stopPropagation(); setShown(true); } }}
      onKeyDown={(e) => { if (!shown && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setShown(true); } }}
    >
      {children}
    </span>
  );
}

function Inline({ item, id }: { item: InlineText; id: string }) {
  const marks = item.m ?? [];
  let node: ReactNode = item.href || marks.includes("code") ? withBreaks(item.t, id) : autolink(item.t, id);
  if (marks.includes("code")) node = <code>{node}</code>;
  if (marks.includes("s")) node = <s>{node}</s>;
  if (marks.includes("u")) node = <u>{node}</u>;
  if (marks.includes("i")) node = <em>{node}</em>;
  if (marks.includes("b")) node = <strong>{node}</strong>;
  if (item.href && isSafeHref(item.href)) {
    node = <a href={item.href} target="_blank" rel="noopener noreferrer nofollow ugc">{node}</a>;
  }
  if (marks.includes("spoiler")) node = <Spoiler>{node}</Spoiler>;
  return <>{node}</>;
}

function Inlines({ items, id }: { items: InlineText[]; id: string }) {
  return <>{items.map((item, i) => <Inline key={i} item={item} id={`${id}-${i}`} />)}</>;
}

export function mediaSrc(item: MediaItem): string {
  return absoluteUrl(item.url);
}

function InlineMedia({ item, caption, onOpen }: { item: MediaItem; caption?: string; onOpen: () => void }) {
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : undefined;
  return (
    <figure className="rt-figure">
      {item.kind === "video" ? (
        <video src={mediaSrc(item)} controls playsInline preload="metadata" style={{ aspectRatio: ratio }} />
      ) : (
        <button type="button" className="rt-figure-open" onClick={onOpen} aria-label="Rasmni kattalashtirish">
          <img src={mediaSrc(item)} alt={caption ?? ""} loading="lazy" decoding="async" style={{ aspectRatio: ratio }} />
        </button>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function BlockView({ block, id, media, onOpenMedia }: { block: Block; id: string; media: Map<string, MediaItem>; onOpenMedia: (mediaId: string) => void }) {
  switch (block.type) {
    case "p": return <p><Inlines items={block.c} id={id} /></p>;
    case "h": return block.level === 2 ? <h2><Inlines items={block.c} id={id} /></h2> : <h3><Inlines items={block.c} id={id} /></h3>;
    case "quote": return <blockquote><Inlines items={block.c} id={id} /></blockquote>;
    case "code": return <pre><code>{block.text}</code></pre>;
    case "list": {
      const items = block.items.map((item, i) => <li key={i}><Inlines items={item} id={`${id}-${i}`} /></li>);
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case "media": {
      const item = media.get(block.id);
      return item ? <InlineMedia item={item} caption={block.caption} onOpen={() => onOpenMedia(block.id)} /> : null;
    }
    case "hr": return <hr />;
  }
}

/** Post/maqola matni. `content` bo'lmasa (eski post) oddiy matn ko'rsatiladi. */
export function RichContent({ doc, text, media, className = "" }: { doc: Doc | null; text: string; media: MediaItem[]; className?: string }) {
  const byId = new Map(media.map((item) => [item.id, item]));
  const inlineImages = (doc ?? []).flatMap((block) => (block.type === "media" && byId.get(block.id)?.kind === "image" ? [byId.get(block.id)!] : []));
  const [viewer, setViewer] = useState<number | null>(null);

  return (
    <div className={`rt-content ${className}`}>
      {doc
        ? doc.map((block, i) => (
            <BlockView key={i} block={block} id={`b${i}`} media={byId} onOpenMedia={(mediaId) => setViewer(inlineImages.findIndex((item) => item.id === mediaId))} />
          ))
        : text.split(/\n{2,}/).map((part, i) => <p key={i}>{autolink(part, `t${i}`)}</p>)}
      {viewer !== null && viewer >= 0 && <Lightbox items={inlineImages} start={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

// ── Albom ───────────────────────────────────────────────────────────

/** Post tepasidagi rasm/videolar — Telegram albomi kabi to'r. */
export function MediaAlbum({ items }: { items: MediaItem[] }) {
  const [viewer, setViewer] = useState<number | null>(null);
  if (!items.length) return null;

  const single = items.length === 1 ? items[0] : null;
  if (single?.kind === "video") {
    const ratio = single.width && single.height ? `${single.width} / ${single.height}` : "16 / 9";
    return (
      <div className="rt-album count-1">
        <video className="rt-album-video" src={mediaSrc(single)} controls playsInline preload="metadata" style={{ aspectRatio: ratio }} />
      </div>
    );
  }

  return (
    <>
      <div className={`rt-album count-${Math.min(items.length, 10)}`}>
        {items.map((item, i) => {
          const style = single && single.width && single.height ? { aspectRatio: `${single.width} / ${single.height}` } : undefined;
          return (
            <button type="button" key={item.id} className="rt-album-item" style={style} onClick={() => setViewer(i)} aria-label={item.kind === "video" ? "Videoni ochish" : "Rasmni ochish"}>
              {item.kind === "video" ? (
                <>
                  <video src={`${mediaSrc(item)}#t=0.1`} muted playsInline preload="metadata" />
                  <span className="rt-play"><Play size={22} fill="currentColor" /></span>
                </>
              ) : (
                <img src={mediaSrc(item)} alt="" loading="lazy" decoding="async" />
              )}
            </button>
          );
        })}
      </div>
      {viewer !== null && <Lightbox items={items} start={viewer} onClose={() => setViewer(null)} />}
    </>
  );
}

// ── To'liq ekranli ko'ruvchi ────────────────────────────────────────

export function Lightbox({ items, start, onClose }: { items: MediaItem[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const touch = useRef<number | null>(null);
  const item = items[index];
  const go = useCallback((step: number) => setIndex((i) => (i + step + items.length) % items.length), [items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose]);

  if (!item) return null;
  return (
    <div
      className="rt-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Media ko'rish"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50 && items.length > 1) go(dx < 0 ? 1 : -1);
      }}
    >
      <button type="button" className="rt-lightbox-close" onClick={onClose} aria-label="Yopish"><X size={26} /></button>
      {items.length > 1 && <span className="rt-lightbox-count">{index + 1} / {items.length}</span>}
      {item.kind === "video"
        ? <video key={item.id} src={mediaSrc(item)} controls autoPlay playsInline />
        : <img key={item.id} src={mediaSrc(item)} alt="" />}
      {items.length > 1 && (
        <Fragment>
          <button type="button" className="rt-lightbox-nav prev" onClick={() => go(-1)} aria-label="Oldingisi"><ChevronLeft size={30} /></button>
          <button type="button" className="rt-lightbox-nav next" onClick={() => go(1)} aria-label="Keyingisi"><ChevronRight size={30} /></button>
        </Fragment>
      )}
    </div>
  );
}

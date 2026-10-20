"use client";

/**
 * Elektron kitob o'qish oynasi: matn ekranga moslab sahifalanadi va haqiqiy kitobdek varaqlanadi
 * (barmoq bilan tortish, bosish, klaviatura). Telefonda bitta sahifa, keng ekranda ikki sahifa yonma-yon.
 * Mundarija, shrift o'lchami va to'xtagan joy (shu qurilmada) eslab qolinadi.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { createPortal } from "react-dom";
import { BookOpen, List, Minus, Plus, RotateCcw, ShoppingBag, Type, X } from "lucide-react";
import { fetchEbook } from "@/lib/api/books-client";
import type { Ebook } from "@/shared/contract";
import { ebookTextLength, parseEbook, tidyEbookSource } from "@/shared/ebook-markup";
import { pageOfAnchor, paginate, renderFrag, type Anchor, type Page } from "./ebook-paginate";

export type ReaderBook = { id: string; title: string; author: string; coverUrl: string | null; color: string };

type Sheet = { kind: "cover" } | { kind: "text"; page: Page; number: number } | { kind: "end" } | { kind: "blank" };
type Turn = { dir: 1 | -1; p: number; anim: boolean };
type Saved = { anchor: Anchor | null };

const FONT_SIZES = [15, 16.5, 18, 19.5, 21, 23] as const;
const DEFAULT_FONT = 2;
const FONT_KEY = "bir-ebook-font";
const placeKey = (id: string) => `bir-ebook:${id}`;
const BLANK: Sheet = { kind: "blank" };

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Xususiy rejim yoki to'lgan xotira — joy eslab qolinmaydi, o'qishga xalaqit bermaydi.
  }
}

/** «SO‘ZBOSHI O‘RNIDA» → «So‘zboshi o‘rnida» (mundarijada katta harflar baqirmasin). */
function tocLabel(text: string): string {
  const upper = text.toLocaleUpperCase("uz");
  if (text !== upper || !/\p{Lu}/u.test(text)) return text;
  return text.charAt(0) + text.slice(1).toLocaleLowerCase("uz");
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Ko'rinadigan sahifa o'lchami: telefonda butun maydon, keng ekranda ikki sahifa. */
function layoutFor(width: number, height: number) {
  const spread = width >= 860 && width > height * 1.15;
  const gap = width < 520 ? 10 : 24;
  const pageW = Math.floor(Math.min(spread ? (width - gap * 2) / 2 : width - gap * 2, spread ? 560 : 640));
  const pageH = Math.floor(Math.min(height - gap * 2, spread ? 860 : 1000));
  return { spread, pageW, pageH };
}

/**
 * `draft` — saqlanmagan matnni ko'rib chiqish (muharrirda): serverga murojaat yo'q, joy eslab qolinmaydi.
 * `onBuy` — do'kon kitobi: tanishuv qismi oxirida «Savatga qo'shish».
 */
export default function EbookReader({ book, draft, onClose, onBuy }: { book: ReaderBook; draft?: string; onClose: () => void; onBuy?: () => void }) {
  const [ebook, setEbook] = useState<Ebook | null>(null);
  const [error, setError] = useState("");
  const [font, setFont] = useState(() => {
    const saved = readStore<number>(FONT_KEY, DEFAULT_FONT);
    return saved >= 0 && saved < FONT_SIZES.length ? saved : DEFAULT_FONT;
  });
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [at, setAt] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [chrome, setChrome] = useState(true);
  const [panel, setPanel] = useState<"toc" | "font" | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const persist = draft === undefined;
  const anchorRef = useRef<Anchor | null>(persist ? readStore<Saved>(placeKey(book.id), { anchor: null }).anchor : null);
  const committing = useRef<number | null>(null);

  // ── Matnni yuklash ───────────────────────────────────────────────
  const load = useCallback((signal?: AbortSignal) => {
    setError("");
    if (draft !== undefined) {
      const body = tidyEbookSource(draft);
      const local = { bookId: book.id, title: book.title, author: book.author, access: "free" as const, full: true, body, chars: ebookTextLength(body), updatedAt: "" };
      setEbook(local);
      return;
    }
    fetchEbook(book.id, signal)
      .then(setEbook)
      .catch((e: Error) => { if (!signal?.aborted) setError(e.message || "Kitobni ochib bo‘lmadi."); });
  }, [book.id, book.title, book.author, draft]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const blocks = useMemo(() => (ebook ? parseEbook(ebook.body) : []), [ebook]);

  // ── O'lcham ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let timer = 0;
    const read = () => setArea((prev) => {
      const next = { w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) };
      return prev && prev.w === next.w && prev.h === next.h ? prev : next;
    });
    read();
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, 180);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
  const layout = area ? layoutFor(area.w, area.h) : null;

  // ── Sahifalash (o'lcham, shrift yoki matn o'zgarsa) ──────────────
  const pageW = layout?.pageW ?? 0;
  const pageH = layout?.pageH ?? 0;
  useEffect(() => {
    const box = measureRef.current;
    if (!box || !blocks.length || !pageW || !pageH) return;
    const controller = new AbortController();
    queueMicrotask(() => setProgress(0));
    void document.fonts.ready
      .then(() => paginate(blocks, box, { signal: controller.signal, onProgress: (n) => { if (n % 10 === 0) setProgress(n); } }))
      .then((result) => {
        if (controller.signal.aborted) return;
        setPages(result);
        setTurn(null);
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError("Kitobni sahifalab bo‘lmadi.");
      });
    return () => controller.abort();
  }, [blocks, pageW, pageH, font]);

  const sheets = useMemo<Sheet[]>(() => {
    if (!pages) return [];
    const list: Sheet[] = [{ kind: "cover" }, ...pages.map((page, i) => ({ kind: "text" as const, page, number: i + 1 }))];
    if (ebook && !ebook.full) list.push({ kind: "end" });
    return list;
  }, [pages, ebook]);

  const spread = layout?.spread ?? false;
  const step = spread ? 2 : 1;
  const norm = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, sheets.length - 1));
    return spread ? clamped - (clamped % 2) : clamped;
  }, [sheets.length, spread]);

  // Yangi sahifalashdan keyin — eslab qolingan joyga.
  useEffect(() => {
    if (!pages) return;
    const anchor = anchorRef.current;
    queueMicrotask(() => setAt(norm(anchor ? pageOfAnchor(pages, anchor) + 1 : 0)));
  }, [pages, norm]);

  // Joyni eslab qolish: ko'rinib turgan birinchi matn sahifasi.
  useEffect(() => {
    if (!pages) return;
    const first = sheets.slice(at, at + step).find((s): s is Extract<Sheet, { kind: "text" }> => s.kind === "text");
    if (!first && at !== 0) return;
    anchorRef.current = first ? first.page.anchor : null;
    if (persist) writeStore(placeKey(book.id), { anchor: anchorRef.current } satisfies Saved);
  }, [at, step, sheets, pages, book.id, persist]);

  useEffect(() => writeStore(FONT_KEY, font), [font]);

  // ── Varaqlash ────────────────────────────────────────────────────
  const canGo = (dir: 1 | -1) => (dir > 0 ? at + step < sheets.length : at > 0);

  const commit = useCallback((dir: 1 | -1, done: boolean) => {
    if (committing.current !== null) window.clearTimeout(committing.current);
    committing.current = null;
    if (done) setAt((current) => norm(current + dir * step));
    setTurn(null);
  }, [norm, step]);

  const flip = useCallback((dir: 1 | -1) => {
    if (turn || !(dir > 0 ? at + step < sheets.length : at > 0)) return;
    setPanel(null);
    if (reducedMotion()) {
      setAt(norm(at + dir * step));
      return;
    }
    setTurn({ dir, p: 0, anim: false });
    requestAnimationFrame(() => requestAnimationFrame(() => setTurn({ dir, p: 1, anim: true })));
    // transitionend kelmasa ham (yashirin varaq) — baribir tugaydi.
    committing.current = window.setTimeout(() => commit(dir, true), 900);
  }, [turn, at, step, sheets.length, norm, commit]);

  const jump = useCallback((index: number) => {
    setTurn(null);
    setPanel(null);
    setAt(norm(index));
  }, [norm]);

  // Klaviatura
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (panel) setPanel(null);
        else onClose();
        return;
      }
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (["ArrowRight", "PageDown", " "].includes(event.key)) flip(1);
      else if (["ArrowLeft", "PageUp"].includes(event.key)) flip(-1);
      else if (event.key === "Home") jump(0);
      else if (event.key === "End") jump(sheets.length - 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, jump, onClose, panel, sheets.length]);

  // Sahifa orqasida aylanmasin; oyna ochilganda fokus kitobda.
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    rootRef.current?.focus();
    return () => { html.style.overflow = before; };
  }, []);

  // Barmoq bilan tortish: varaq barmoqqa ergashadi; qo'yib yuborilganda tugaydi yoki qaytadi.
  const drag = useRef<{ id: number; x: number; y: number; t: number; dir: 1 | -1 | 0 } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (turn || event.button !== 0 || (event.target as HTMLElement).closest("button, a, input")) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now(), dir: 0 };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.dir) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      if (!canGo(dir)) {
        drag.current = null;
        return;
      }
      d.dir = dir;
      event.currentTarget.setPointerCapture(event.pointerId);
      setPanel(null);
    }
    const p = Math.max(0, Math.min(1, (-dx * d.dir) / (pageW * (spread ? 1.6 : 1))));
    setTurn({ dir: d.dir, p, anim: false });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== event.pointerId) return;
    if (d.dir) {
      const dx = event.clientX - d.x;
      const p = Math.max(0, Math.min(1, (-dx * d.dir) / (pageW * (spread ? 1.6 : 1))));
      const speed = Math.abs(dx) / Math.max(1, performance.now() - d.t);
      const done = p > 0.3 || (speed > 0.45 && p > 0.04);
      const target = done ? 1 : 0;
      if (p === target) commit(d.dir, done);
      else {
        setTurn({ dir: d.dir, p: target, anim: true });
        const dir = d.dir;
        committing.current = window.setTimeout(() => commit(dir, done), 900);
      }
      return;
    }
    // Bosish: chap chekka — orqaga, o'ng chekka — oldinga, o'rtasi — boshqaruvni yashirish/ko'rsatish.
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    if (x < 0.3) flip(-1);
    else if (x > 0.7) flip(1);
    else setChrome((v) => !v);
  };
  const onTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== "transform" || !turn?.anim) return;
    commit(turn.dir, turn.p === 1);
  };

  // ── Hozirgi holat ────────────────────────────────────────────────
  const textPages = pages?.length ?? 0;
  const visible = sheets.slice(at, at + step);
  const current = visible.find((s): s is Extract<Sheet, { kind: "text" }> => s.kind === "text");
  const chapter = current?.page.chapter ?? "";
  const shownNumbers = visible.flatMap((s) => (s.kind === "text" ? [s.number] : []));
  const pageLabel = !pages
    ? ""
    : shownNumbers.length
      ? `${shownNumbers.join("–")} / ${textPages}`
      : visible[0]?.kind === "cover" ? "Muqova" : "Oxiri";

  const toc = useMemo(() => {
    if (!pages) return [];
    const firstPage = new Map<number, number>();
    pages.forEach((page, index) => page.frags.forEach((f) => { if (!firstPage.has(f.block)) firstPage.set(f.block, index); }));
    return blocks.flatMap((b, i) => (b.kind === "h1" || b.kind === "h2") && firstPage.has(i) ? [{ level: b.kind, label: tocLabel(b.text), sheet: firstPage.get(i)! + 1 }] : []);
  }, [blocks, pages]);

  const sheetAt = (index: number): Sheet => sheets[index] ?? BLANK;
  const sheetView = (sheet: Sheet, side?: "left" | "right") => (
    <SheetView sheet={sheet} side={side} book={book} ebook={ebook} onBuy={onBuy} onRestart={() => jump(1)} total={textPages} />
  );

  // Varaq qatlamlari. Bitta sahifa: joriy varaq chapga buriladi, ostida keyingisi. Ikki sahifa: o'ng varaq
  // chapga o'tadi — old yuzida joriy o'ng sahifa, orqa yuzida keyingi chap sahifa.
  let layers: ReactNode;
  if (!pages || !layout) layers = null;
  else if (!spread) {
    const base = turn ? sheetAt(turn.dir > 0 ? at + 1 : at) : sheetAt(at);
    layers = (
      <div className="eb-slot is-single">
        {sheetView(base)}
        {turn && <Leaf turn={turn} front={sheetView(sheetAt(turn.dir > 0 ? at : at - 1))} back={sheetView(BLANK)} onTransitionEnd={onTransitionEnd} />}
      </div>
    );
  } else {
    const left = turn?.dir === -1 ? sheetAt(at - 2) : sheetAt(at);
    const right = turn?.dir === 1 ? sheetAt(at + 3) : sheetAt(at + 1);
    layers = (
      <>
        <div className="eb-slot is-left">{sheetView(left, "left")}</div>
        <div className="eb-slot is-right">
          {sheetView(right, "right")}
          {turn && (
            <Leaf
              turn={turn}
              front={sheetView(turn.dir > 0 ? sheetAt(at + 1) : sheetAt(at - 1), "right")}
              back={sheetView(turn.dir > 0 ? sheetAt(at + 2) : sheetAt(at), "left")}
              onTransitionEnd={onTransitionEnd}
            />
          )}
        </div>
      </>
    );
  }

  const style = {
    "--eb-w": `${pageW}px`,
    "--eb-h": `${pageH}px`,
    "--eb-font": `${FONT_SIZES[font]}px`,
  } as CSSProperties;

  return createPortal(
    <div
      ref={rootRef}
      className={`eb-reader${chrome ? "" : " is-calm"}${spread ? " is-spread" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`«${book.title}» — elektron kitob`}
      tabIndex={-1}
      style={style}
    >
      <header className="eb-bar">
        <button type="button" className="eb-icon" aria-label="Yopish" onClick={onClose}><X size={20} /></button>
        <div className="eb-title">
          <strong>{book.title}</strong>
          <span>{chapter ? tocLabel(chapter) : book.author}</span>
        </div>
        <button type="button" className="eb-icon" aria-label="Mundarija" aria-expanded={panel === "toc"} disabled={!toc.length} onClick={() => setPanel(panel === "toc" ? null : "toc")}><List size={20} /></button>
        <button type="button" className="eb-icon" aria-label="Shrift o‘lchami" aria-expanded={panel === "font"} onClick={() => setPanel(panel === "font" ? null : "font")}><Type size={19} /></button>
      </header>

      <div
        ref={stageRef}
        className="eb-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; if (turn && !turn.anim) setTurn({ ...turn, p: 0, anim: true }); }}
      >
        {/* O'lchov sahifasi: ko'rinadigan sahifa bilan bir xil o'lcham va uslub. */}
        <div className="eb-page eb-measure" aria-hidden="true">
          <div className="eb-running" />
          <div className="eb-body" ref={measureRef} />
          <div className="eb-folio" />
        </div>
        <div className="eb-book">{layers}</div>

        {!pages && !error && (
          <p className="eb-status" role="status">
            <BookOpen size={22} aria-hidden="true" />
            {ebook ? `Sahifalar tayyorlanmoqda…${progress ? ` ${progress}` : ""}` : "Kitob ochilmoqda…"}
          </p>
        )}
        {error && (
          <div className="eb-status is-error" role="alert">
            <p>{error}</p>
            <button type="button" className="button" onClick={() => load()}><RotateCcw size={16} /> Qayta urinish</button>
          </div>
        )}
      </div>

      <footer className="eb-foot">
        <span className="eb-count" aria-live="polite">{pageLabel}</span>
        {sheets.length > 1 && (
          <input
            type="range"
            className="eb-range"
            aria-label="Sahifani tanlash"
            min={0}
            max={sheets.length - 1}
            step={step}
            value={at}
            onChange={(event) => jump(Number(event.target.value))}
            style={{ "--eb-at": `${(at / Math.max(1, sheets.length - 1)) * 100}%` } as CSSProperties}
          />
        )}
      </footer>

      {panel === "toc" && (
        <aside className="eb-panel eb-toc" aria-label="Mundarija">
          <h2>Mundarija</h2>
          <ol>
            {toc.map((item) => (
              <li key={`${item.sheet}-${item.label}`} className={item.level === "h2" ? "is-sub" : undefined}>
                <button type="button" aria-current={visible.some((s) => s.kind === "text" && s.number === item.sheet) || undefined} onClick={() => jump(item.sheet)}>
                  <span>{item.label}</span>
                  <small>{item.sheet}</small>
                </button>
              </li>
            ))}
          </ol>
          {ebook && !ebook.full && <p className="eb-note">Mundarijada faqat tanishuv qismidagi boblar.</p>}
        </aside>
      )}
      {panel === "font" && (
        <aside className="eb-panel eb-font" aria-label="Shrift o‘lchami">
          <button type="button" aria-label="Kichikroq" disabled={font === 0} onClick={() => setFont((f) => Math.max(0, f - 1))}><Minus size={18} /></button>
          <span aria-live="polite"><b style={{ fontSize: FONT_SIZES[font] }}>Aa</b> {FONT_SIZES[font]}</span>
          <button type="button" aria-label="Kattaroq" disabled={font === FONT_SIZES.length - 1} onClick={() => setFont((f) => Math.min(FONT_SIZES.length - 1, f + 1))}><Plus size={18} /></button>
        </aside>
      )}
    </div>,
    document.body,
  );
}

function Leaf({ turn, front, back, onTransitionEnd }: { turn: Turn; front: ReactNode; back: ReactNode; onTransitionEnd: (e: TransitionEvent<HTMLDivElement>) => void }) {
  // Oldinga: 0° → -180°; orqaga: -180° → 0°.
  const progress = turn.dir > 0 ? turn.p : 1 - turn.p;
  const style = {
    transform: `rotateY(${-180 * progress}deg)`,
    "--eb-shade": Math.sin(progress * Math.PI).toFixed(3),
  } as CSSProperties;
  return (
    <div className={`eb-leaf${turn.anim ? " is-anim" : ""}`} style={style} onTransitionEnd={onTransitionEnd} aria-hidden="true">
      <div className="eb-face is-front">{front}</div>
      <div className="eb-face is-back">{back}</div>
    </div>
  );
}

function SheetView({ sheet, side, book, ebook, onBuy, onRestart, total }: {
  sheet: Sheet;
  side?: "left" | "right";
  book: ReaderBook;
  ebook: Ebook | null;
  onBuy?: () => void;
  onRestart: () => void;
  total: number;
}) {
  const sideClass = side ? ` is-${side}` : "";
  if (sheet.kind === "text") return <TextPage page={sheet.page} number={sheet.number} side={side} />;
  if (sheet.kind === "cover") {
    return (
      <div className={`eb-page eb-cover${sideClass}`}>
        <div className="eb-cover-art" style={{ backgroundColor: book.color }}>
          {book.coverUrl ? <img src={book.coverUrl} alt="" /> : <span>{book.title}</span>}
        </div>
        <h2>{book.title}</h2>
        <p>{book.author}</p>
        <span className="eb-cover-star" aria-hidden="true" />
        {ebook && ebook.access === "preview" && (
          <p className="eb-cover-note">{ebook.full ? "To‘liq matn — admin/moderator sifatida ko‘ryapsiz" : "Tanishuv uchun boshlang‘ich qismi"}</p>
        )}
        {total > 0 && <small>{total} sahifa · varaqlash uchun suring yoki chetini bosing</small>}
      </div>
    );
  }
  if (sheet.kind === "end") {
    return (
      <div className={`eb-page eb-end${sideClass}`}>
        <span className="eb-cover-star" aria-hidden="true" />
        <h2>Tanishuv qismi shu yerda tugadi</h2>
        <p>Kitobning to‘liq elektron nusxasi keyinroq ochiladi. Hozircha bosma nusxasini buyurtma qilishingiz mumkin.</p>
        <div className="eb-end-actions">
          {onBuy && <button type="button" className="button" onClick={onBuy}><ShoppingBag size={16} /> Savatga qo‘shish</button>}
          <button type="button" className="button secondary" onClick={onRestart}>Boshiga qaytish</button>
        </div>
      </div>
    );
  }
  return <div className={`eb-page is-blank${sideClass}`} />;
}

function TextPage({ page, number, side }: { page: Page; number: number; side?: "left" | "right" }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // Chizishdan oldin — varaq almashganda eski matn bir lahza ham ko'rinmasin.
  useLayoutEffect(() => {
    bodyRef.current?.replaceChildren(...page.frags.map(renderFrag));
  }, [page]);
  return (
    <div className={`eb-page${side ? ` is-${side}` : ""}`}>
      <div className="eb-running" aria-hidden="true">{tocLabel(page.chapter)}</div>
      <div className="eb-body" ref={bodyRef} />
      <div className="eb-folio">{number}</div>
    </div>
  );
}

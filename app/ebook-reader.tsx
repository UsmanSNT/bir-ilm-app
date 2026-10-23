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
import { Bookmark, BookOpen, Copy, Highlighter, List, Minus, Plus, RotateCcw, Search, Send, ShoppingBag, SlidersHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { addMark, fetchEbook, fetchMarks, removeMark } from "@/lib/api/books-client";
import { HIGHLIGHT_COLORS, type CreateEbookMarkInput, type Ebook, type EbookMark, type EbookSource, type HighlightColor } from "@/shared/contract";
import { ebookTextLength, parseEbook, runsText, tidyEbookSource, type EbookBlock, type MarkRange } from "@/shared/ebook-markup";
import { pageOfAnchor, paginate, renderFrag, type Anchor, type Page } from "./ebook-paginate";
import { copyText, type Quote } from "./ebook-quote";
import QuoteDialog from "./ebook-quote-dialog";
import EbookSourceNote from "./ebook-source";

const colorHex = (key: HighlightColor) => HIGHLIGHT_COLORS.find((c) => c.key === key)?.hex ?? HIGHLIGHT_COLORS[0].hex;

export type ReaderBook = { id: string; title: string; author: string; coverUrl: string | null; color: string };

/** Blok matni: xatboshi/sarlavha uchun bitta qator, she'r/o'rta/o'ng uchun qatorlar «\n» bilan. */
function blockText(block: EbookBlock): string {
  if ("lines" in block) return block.lines.map(runsText).join("\n");
  if ("runs" in block) return runsText(block.runs);
  return "";
}

/** Qidiruvda solishtirish: kichik harf, turli apostroflar bir xil (uzunlik o'zgarmaydi — indekslar mos). */
/** Saqlanmagan (vaqtinchalik) belgilar uchun ketma-ket raqam. */
let pendingSeq = 0;

const foldText = (text: string) => text.toLocaleLowerCase("uz").replace(/[‘’ʼʻ`]/g, "'");

type Selected = { block: number; start: number; end: number; text: string; x: number; y: number };

function closestParagraph(node: Node): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node.parentElement;
  return el?.closest<HTMLElement>("p[data-block]") ?? null;
}

/** Tanlangan matnni blok ichidagi belgi oralig'iga aylantiradi. Bir xatboshi ichidagi tanlovgina qabul qilinadi. */
function selectionSpan(sel: Selection, blocks: EbookBlock[]): Selected | null {
  if (sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const para = closestParagraph(range.startContainer);
  if (!para || para !== closestParagraph(range.endContainer)) return null;
  const block = Number(para.dataset.block);
  const from = Number(para.dataset.from);
  const local = (node: Node, offset: number) => {
    const probe = document.createRange();
    probe.selectNodeContents(para);
    probe.setEnd(node, offset);
    return probe.toString().length;
  };
  const start = from + local(range.startContainer, range.startOffset);
  const end = from + local(range.endContainer, range.endOffset);
  const source = blocks[block];
  if (!source || end <= start) return null;
  const text = blockText(source).slice(start, end);
  if (!text.trim()) return null;
  const rect = range.getBoundingClientRect();
  return { block, start, end, text, x: rect.left + rect.width / 2, y: rect.top };
}

type Sheet = { kind: "cover" } | { kind: "text"; page: Page; number: number } | { kind: "end" } | { kind: "blank" };
type Turn = { dir: 1 | -1; p: number; anim: boolean };
type Saved = { anchor: Anchor | null };

const FONT_SIZES = [15, 16.5, 18, 19.5, 21, 23] as const;
const DEFAULT_FONT = 2;
const FONT_KEY = "bir-ebook-font";
const AUTO_KEY = "bir-ebook-auto";
const AWAKE_KEY = "bir-ebook-awake";
/** Avtomatik varaqlash: har sahifa necha soniya turadi. */
const AUTO_SECONDS = [10, 15, 20, 30, 45, 60, 90, 120] as const;
type AutoPlay = { on: boolean; seconds: number };
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
export default function EbookReader({ book, draft, draftSource = null, onClose, onBuy }: { book: ReaderBook; draft?: string; draftSource?: EbookSource | null; onClose: () => void; onBuy?: () => void }) {
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
  // Yuqori va pastki panel: odatda yashirin; markazga bosilganda yoki panel ochilganda ko'rinadi.
  const [chrome, setChrome] = useState(false);
  const [panel, setPanel] = useState<"toc" | "font" | "find" | null>(null);
  const chromeShown = chrome || panel !== null;
  const [auto, setAuto] = useState<AutoPlay>(() => {
    const saved = readStore<AutoPlay>(AUTO_KEY, { on: false, seconds: 30 });
    return { on: Boolean(saved.on), seconds: AUTO_SECONDS.includes(saved.seconds as never) ? saved.seconds : 30 };
  });
  const [awake, setAwake] = useState(() => readStore<boolean>(AWAKE_KEY, true));
  const [findTab, setFindTab] = useState<"search" | "marks">("search");
  const [query, setQuery] = useState("");
  const [marks, setMarks] = useState<EbookMark[]>([]);
  const [selected, setSelected] = useState<Selected | null>(null);
  /** Toolbar tugmasi bosilganda tanlash yo'qolmasligi uchun vaqt oralig'i (ms). */
  const holdUntil = useRef(0);
  const readSelection = useRef<() => void>(() => undefined);
  /** Telefonda (sensorli ekran) toolbar ekran pastida turadi — tanlash menyusi ustiga chiqmasin. */
  const touchUi = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const [share, setShare] = useState<Quote | null>(null);
  const persist = draft === undefined;

  const stageRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<Anchor | null>(persist ? readStore<Saved>(placeKey(book.id), { anchor: null }).anchor : null);
  const committing = useRef<number | null>(null);

  // ── Matnni yuklash ───────────────────────────────────────────────
  const load = useCallback((signal?: AbortSignal) => {
    setError("");
    if (draft !== undefined) {
      const body = tidyEbookSource(draft);
      const local = { bookId: book.id, title: book.title, author: book.author, access: "free" as const, full: true, body, chars: ebookTextLength(body), updatedAt: "", source: draftSource };
      setEbook(local);
      return;
    }
    fetchEbook(book.id, signal)
      .then(setEbook)
      .catch((e: Error) => { if (!signal?.aborted) setError(e.message || "Kitobni ochib bo‘lmadi."); });
  }, [book.id, book.title, book.author, draft, draftSource]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const blocks = useMemo(() => (ebook ? parseEbook(ebook.body) : []), [ebook]);

  // Xatcho‘p va belgilar — serverdan, faqat o'qish rejimida (muharrir ko'rib chiqishida emas).
  useEffect(() => {
    if (!persist || !ebook) return;
    let alive = true;
    fetchMarks(book.id).then((items) => { if (alive) setMarks(items); }).catch(() => {});
    return () => { alive = false; };
  }, [book.id, persist, ebook]);

  // Matn tanlanganda belgilash tugmasi uchun joyni aniqlaymiz.
  useEffect(() => {
    if (!persist) return;
    let timer = 0;
    const read = () => {
      // Toolbar tugmasi bosilayotganda telefon tanlashni bekor qiladi — shu lahzada toolbar yashirinmasin.
      if (Date.now() < holdUntil.current) return;
      const sel = window.getSelection();
      const inside = Boolean(sel?.anchorNode && rootRef.current?.contains(sel.anchorNode));
      setSelected(sel && inside ? selectionSpan(sel, blocks) : null);
    };
    readSelection.current = read;
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, 120);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      window.clearTimeout(timer);
    };
  }, [persist, blocks]);

  // Belgilar matnga mos keladimi: matn tahrirlangan bo'lsa, shu so'z bo'yicha qayta topiladi; topilmasa — yashirin.
  const resolved = useMemo(() => marks.flatMap((m): EbookMark[] => {
    const block = blocks[m.block];
    if (!block) return [];
    if (m.kind === "bookmark") return [m];
    const text = blockText(block);
    if (text.slice(m.start, m.end) === m.quote) return [m];
    const at = text.indexOf(m.quote);
    return at < 0 ? [] : [{ ...m, start: at, end: at + m.quote.length }];
  }).sort((a, b) => a.block - b.block || a.start - b.start), [marks, blocks]);

  const highlightsByBlock = useMemo(() => {
    const map = new Map<number, MarkRange[]>();
    for (const m of resolved) {
      if (m.kind === "highlight") map.set(m.block, [...(map.get(m.block) ?? []), { start: m.start, end: m.end, color: m.color }]);
    }
    return map;
  }, [resolved]);

  // Qidiruv indeksi: har bir xatboshi, sarlavha va she'r qatori alohida.
  const searchIndex = useMemo(() => blocks.flatMap((b, i) => {
    if ("lines" in b) return b.lines.map((line, j) => ({ block: i, line: j, text: runsText(line) }));
    if ("runs" in b) return [{ block: i, line: -1, text: runsText(b.runs) }];
    return [];
  }), [blocks]);

  const hits = useMemo(() => {
    const q = foldText(query.trim());
    if (q.length < 2) return [];
    const out: { block: number; offset: number; at: number; text: string }[] = [];
    for (const entry of searchIndex) {
      const t = foldText(entry.text);
      if (entry.line >= 0) {
        const at = t.indexOf(q);
        if (at >= 0) out.push({ block: entry.block, offset: entry.line, at, text: entry.text });
      } else {
        for (let at = t.indexOf(q); at >= 0 && out.length < 200; at = t.indexOf(q, at + q.length)) {
          out.push({ block: entry.block, offset: at, at, text: entry.text });
        }
      }
      if (out.length >= 200) break;
    }
    return out;
  }, [query, searchIndex]);

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
  useEffect(() => writeStore(AUTO_KEY, auto), [auto]);
  useEffect(() => writeStore(AWAKE_KEY, awake), [awake]);

  // Ekran uxlamasin: brauzer qo'llasa, o'qish davomida ekran yoqiq turadi (qaytib kelganda qayta so'raladi).
  useEffect(() => {
    if (!awake || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let alive = true;
    let lock: WakeLockSentinel | null = null;
    const take = () => {
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (alive) lock = sentinel;
          else void sentinel.release();
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") take();
    };
    take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [awake]);

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

  // Avtomatik varaqlash: har sahifadan keyin belgilangan soniya o'tgach keyingisi. Qo'lda varaqlanganda taymer qayta boshlanadi.
  const canNext = at + step < sheets.length;
  useEffect(() => {
    if (!auto.on || !pages || turn || panel !== null || !canNext) return;
    const id = window.setTimeout(() => flip(1), auto.seconds * 1000);
    return () => window.clearTimeout(id);
  }, [auto.on, auto.seconds, pages, turn, panel, canNext, at, flip]);

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
  // `text` — sichqoncha matn ustida: surish sahifani aylantirmaydi (matn tanlanadi), bosish esa oddiy bosish.
  const drag = useRef<{ id: number; x: number; y: number; t: number; dir: 1 | -1 | 0; text: boolean } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (turn || event.button !== 0 || (event.target as HTMLElement).closest("button, a, input")) return;
    // Matn tanlangan bo'lsa (tutqichlar) yoki sichqoncha matn ustida — sahifa aylanmaydi.
    const text = (event.pointerType === "mouse" && Boolean((event.target as HTMLElement).closest(".eb-body"))) || Boolean(window.getSelection()?.toString());
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now(), dir: 0, text };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.dir) {
      if (d.text || Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
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
    // Matn tanlangan bo'lsa — bu bosish emas, belgilash tugmasi uchun.
    if (window.getSelection()?.toString()) return;
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
  const pageLabel = (!pages
    ? ""
    : shownNumbers.length
      ? `${shownNumbers.join("–")} / ${textPages}`
      : visible[0]?.kind === "cover" ? "Muqova" : "Oxiri") + (auto.on && pages ? ` · ${auto.seconds} s` : "");

  const toc = useMemo(() => {
    if (!pages) return [];
    const firstPage = new Map<number, number>();
    pages.forEach((page, index) => page.frags.forEach((f) => { if (!firstPage.has(f.block)) firstPage.set(f.block, index); }));
    return blocks.flatMap((b, i) => (b.kind === "h1" || b.kind === "h2") && firstPage.has(i) ? [{ level: b.kind, label: tocLabel(b.text), sheet: firstPage.get(i)! + 1 }] : []);
  }, [blocks, pages]);

  const sheetAt = (index: number): Sheet => sheets[index] ?? BLANK;
  const sheetView = (sheet: Sheet, side?: "left" | "right") => (
    <SheetView sheet={sheet} side={side} book={book} ebook={ebook} onBuy={onBuy} onRestart={() => jump(1)} total={textPages} highlights={highlightsByBlock} />
  );

  /** Joy qaysi varaqda: varaq raqami = sahifa raqami (muqova — 0). */
  const sheetFor = (block: number, offset: number) => (pages ? pageOfAnchor(pages, { block, offset }) + 1 : 0);

  const saveMark = (mark: CreateEbookMarkInput) => {
    const temp: EbookMark = { id: `tmp_${++pendingSeq}`, createdAt: "", ...mark };
    setMarks((list) => [...list, temp]);
    addMark(book.id, mark)
      .then((saved) => setMarks((list) => list.map((m) => (m.id === temp.id ? saved : m))))
      .catch(() => {
        setMarks((list) => list.filter((m) => m.id !== temp.id));
        toast.error("Belgi saqlanmadi. Internetni tekshirib, qayta urinib ko‘ring.");
      });
  };

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelected(null);
  };

  const highlight = (sel: Selected, color: HighlightColor) => {
    if (sel.text.length > 500) {
      toast.error("Belgi 500 belgidan oshmasin. Qisqaroq tanlang.");
      return;
    }
    clearSelection();
    saveMark({ kind: "highlight", block: sel.block, start: sel.start, end: sel.end, quote: sel.text, color });
  };

  const quoteOf = (sel: Selected): Quote => ({ text: sel.text, author: book.author, bookTitle: book.title, accent: colorHex("tilla") });

  const copySelected = async (sel: Selected) => {
    clearSelection();
    const ok = await copyText(sel.text);
    toast(ok ? "Matn nusxalandi" : "Nusxalab bo‘lmadi. Matnni qo‘lda belgilab nusxalang.");
  };

  const shareSelected = (sel: Selected) => {
    clearSelection();
    setShare(quoteOf(sel));
  };

  // Xatcho‘p: joriy varaqning boshi. Shu joyda xatcho‘p bo'lsa — olib tashlanadi.
  const anchorNow = current ? current.page.anchor : null;
  const bookmarkHere = anchorNow ? resolved.find((m) => m.kind === "bookmark" && m.block === anchorNow.block && m.start === anchorNow.offset) : undefined;

  const removeLocal = (id: string) => {
    const old = marks.find((m) => m.id === id);
    setMarks((list) => list.filter((m) => m.id !== id));
    if (id.startsWith("tmp_")) return;
    removeMark(book.id, id).catch(() => {
      if (old) setMarks((list) => [...list, old]);
      toast.error("O‘chirilmadi. Qayta urinib ko‘ring.");
    });
  };

  const toggleBookmark = () => {
    if (!anchorNow) {
      toast("Xatcho‘p uchun avval matn sahifasiga o‘ting.");
      return;
    }
    if (bookmarkHere) {
      removeLocal(bookmarkHere.id);
      return;
    }
    const source = blocks[anchorNow.block];
    const quote = source.kind === "verse" || source.kind === "center" || source.kind === "right"
      ? runsText(source.lines[anchorNow.offset] ?? [])
      : blockText(source).slice(anchorNow.offset, anchorNow.offset + 80);
    saveMark({ kind: "bookmark", block: anchorNow.block, start: anchorNow.offset, end: anchorNow.offset, quote: quote.slice(0, 80), color: "tilla" });
  };

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
      className={`eb-reader${chromeShown ? " is-chrome" : ""}${spread ? " is-spread" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`«${book.title}» — elektron kitob`}
      tabIndex={-1}
      style={style}
    >
      <div className="eb-edge eb-edge-top" aria-hidden="true"><span className="eb-handle" /></div>
      <header className="eb-bar">
        <button type="button" className="eb-icon" aria-label="Yopish" onClick={onClose}><X size={20} /></button>
        <div className="eb-title">
          <strong>{book.title}</strong>
          <span>{chapter ? tocLabel(chapter) : book.author}</span>
        </div>
        <button type="button" className="eb-icon" aria-label="Qidirish va belgilar" aria-expanded={panel === "find"} disabled={!pages} onClick={() => setPanel(panel === "find" ? null : "find")}><Search size={19} /></button>
        <button type="button" className="eb-icon" aria-label="Mundarija" aria-expanded={panel === "toc"} disabled={!toc.length} onClick={() => setPanel(panel === "toc" ? null : "toc")}><List size={20} /></button>
        <button type="button" className="eb-icon" aria-label="Sozlamalar" aria-expanded={panel === "font"} onClick={() => setPanel(panel === "font" ? null : "font")}><SlidersHorizontal size={19} /></button>
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

      <div className="eb-edge eb-edge-bottom" aria-hidden="true"><span className="eb-handle" /></div>
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
        {persist && pages && (
          <button
            type="button"
            className="eb-icon eb-mark-btn"
            aria-label={bookmarkHere ? "Xatcho‘pni olib tashlash" : "Xatcho‘p qo‘yish"}
            aria-pressed={Boolean(bookmarkHere)}
            onClick={toggleBookmark}
          >
            <Bookmark size={18} fill={bookmarkHere ? "currentColor" : "none"} />
          </button>
        )}
      </footer>

      {selected && (
        <div
          className={`eb-sel${touchUi ? " is-touch" : ""}`}
          role="toolbar"
          aria-label="Matn bilan amal"
          style={touchUi ? undefined : { left: Math.min(Math.max(selected.x, 175), window.innerWidth - 175), top: selected.y }}
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={() => {
            holdUntil.current = Date.now() + 1200;
            window.setTimeout(() => readSelection.current(), 1300);
          }}
        >
          <button type="button" className="eb-sel-icon" aria-label="Nusxalash" title="Nusxalash" onClick={() => void copySelected(selected)}><Copy size={16} /></button>
          {persist && (
            <span className="eb-sel-colors" role="group" aria-label="Belgilash rangi">
              <Highlighter size={15} aria-hidden="true" />
              {HIGHLIGHT_COLORS.map((c) => (
                <button key={c.key} type="button" className="eb-sel-dot" style={{ "--dot": c.hex } as CSSProperties} aria-label={`${c.label} rang bilan belgilash`} title={`${c.label} rang`} onClick={() => highlight(selected, c.key)} />
              ))}
            </span>
          )}
          <button type="button" className="eb-sel-icon" aria-label="Yuborish" title="Yuborish" onClick={() => shareSelected(selected)}><Send size={16} /></button>
        </div>
      )}
      {share && <QuoteDialog quote={share} onClose={() => setShare(null)} />}

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
      {panel === "find" && (
        <aside className="eb-panel eb-find" aria-label="Qidirish va belgilar">
          <div className="eb-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={findTab === "search"} onClick={() => setFindTab("search")}>Qidiruv</button>
            <button type="button" role="tab" aria-selected={findTab === "marks"} disabled={!persist} onClick={() => setFindTab("marks")}>
              Belgilar{persist && resolved.length ? ` · ${resolved.length}` : ""}
            </button>
          </div>
          {findTab === "search" && (
            <>
              <input
                type="search"
                className="eb-find-input"
                placeholder="Eshitgan jumlangizning bir qismi"
                aria-label="Matn bo‘yicha qidirish"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query.trim().length >= 2 && (
                <p className="eb-note" aria-live="polite">{hits.length ? `${hits.length}${hits.length >= 200 ? "+" : ""} ta joy topildi` : "Hech narsa topilmadi"}</p>
              )}
              <ol className="eb-hits">
                {hits.slice(0, 100).map((hit, index) => {
                  const q = query.trim().length;
                  const snippet = hit.text.slice(Math.max(0, hit.at - 40), hit.at + q + 60);
                  return (
                    <li key={`${hit.block}-${hit.offset}-${index}`}>
                      <button type="button" onClick={() => jump(sheetFor(hit.block, hit.offset))}>
                        <span>…{snippet}…</span>
                        <small>{sheetFor(hit.block, hit.offset)}</small>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
          {findTab === "marks" && (
            <ol className="eb-hits">
              {resolved.length === 0 && <li className="eb-note">Hali belgi yo‘q. Matnni tanlab «Belgilash» ni bosing yoki varaq boshida xatcho‘p qo‘ying.</li>}
              {resolved.map((m) => (
                <li key={m.id} className={`is-${m.kind}`}>
                  <button type="button" onClick={() => jump(sheetFor(m.block, m.start))}>
                    <span>{m.kind === "bookmark" ? <><Bookmark size={13} /> Xatcho‘p · </> : <i className="eb-dot" style={{ "--dot": colorHex(m.color) } as CSSProperties} />} {m.quote}</span>
                    <small>{sheetFor(m.block, m.start)}</small>
                  </button>
                  <button type="button" className="eb-del" aria-label="Belgini o‘chirish" onClick={() => removeLocal(m.id)}><Trash2 size={15} /></button>
                </li>
              ))}
            </ol>
          )}
        </aside>
      )}
      {panel === "font" && (
        <aside className="eb-panel eb-font" aria-label="Sozlamalar">
          <div className="eb-set-row">
            <span className="eb-set-label">Shrift</span>
            <button type="button" aria-label="Kichikroq" disabled={font === 0} onClick={() => setFont((f) => Math.max(0, f - 1))}><Minus size={18} /></button>
            <span aria-live="polite"><b style={{ fontSize: FONT_SIZES[font] }}>Aa</b> {FONT_SIZES[font]}</span>
            <button type="button" aria-label="Kattaroq" disabled={font === FONT_SIZES.length - 1} onClick={() => setFont((f) => Math.min(FONT_SIZES.length - 1, f + 1))}><Plus size={18} /></button>
          </div>
          <button type="button" role="switch" aria-checked={awake} className="eb-set-switch" onClick={() => setAwake((v) => !v)}>
            <span>Ekran uxlamasin</span><i aria-hidden="true" />
          </button>
          <button type="button" role="switch" aria-checked={auto.on} className="eb-set-switch" onClick={() => setAuto((a) => ({ ...a, on: !a.on }))}>
            <span>Avtomatik varaqlash</span><i aria-hidden="true" />
          </button>
          <div className="eb-set-label">Har sahifa necha soniya turadi</div>
          <div className="eb-set-chips" role="radiogroup" aria-label="Har sahifa necha soniya turadi">
            {AUTO_SECONDS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                role="radio"
                aria-checked={auto.seconds === seconds}
                className={auto.seconds === seconds ? "is-on" : undefined}
                onClick={() => setAuto((a) => ({ ...a, seconds }))}
              >
                {seconds >= 60 ? `${seconds / 60} daq` : `${seconds} s`}
              </button>
            ))}
          </div>
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

function SheetView({ sheet, side, book, ebook, onBuy, onRestart, total, highlights }: {
  sheet: Sheet;
  side?: "left" | "right";
  book: ReaderBook;
  ebook: Ebook | null;
  onBuy?: () => void;
  onRestart: () => void;
  total: number;
  highlights: Map<number, MarkRange[]>;
}) {
  const sideClass = side ? ` is-${side}` : "";
  if (sheet.kind === "text") return <TextPage page={sheet.page} number={sheet.number} side={side} highlights={highlights} />;
  if (sheet.kind === "cover") {
    return (
      <div className={`eb-page eb-cover${sideClass}`}>
        <div className="eb-cover-art" style={{ backgroundColor: book.color }}>
          {book.coverUrl ? <img src={book.coverUrl} alt="" /> : <span>{book.title}</span>}
        </div>
        <h2>{book.title}</h2>
        <p>{book.author}</p>
        <span className="eb-cover-star" aria-hidden="true" />
        {ebook?.source && <EbookSourceNote source={ebook.source} className="eb-cover-source" />}
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

function TextPage({ page, number, side, highlights }: { page: Page; number: number; side?: "left" | "right"; highlights: Map<number, MarkRange[]> }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // Chizishdan oldin — varaq almashganda eski matn bir lahza ham ko'rinmasin.
  useLayoutEffect(() => {
    bodyRef.current?.replaceChildren(...page.frags.map((frag) => renderFrag(frag, frag.t === "p" ? highlights.get(frag.block) : undefined)));
  }, [page, highlights]);
  return (
    <div className={`eb-page${side ? ` is-${side}` : ""}`}>
      <div className="eb-running" aria-hidden="true">{tocLabel(page.chapter)}</div>
      <div className="eb-body" ref={bodyRef} />
      <div className="eb-folio">{number}</div>
    </div>
  );
}

"use client";

/**
 * Formatlangan matn muharriri.
 *
 * Telegram'dagi formatlar: qalin, kursiv, tagiga chizilgan, ustidan chizilgan,
 * monospace, spoiler, havola. Maqola uchun: sarlavhalar, iqtibos, ro'yxatlar,
 * kod bloki, ajratgich va matn ichiga rasm/video.
 *
 * Muharrir ichidagi HTML hech qachon serverga yuborilmaydi: `getDoc()` uni
 * oq ro'yxat bo'yicha bloklarga aylantiradi (doc-dom.ts).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Bold, Code, EyeOff, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Quote, RemoveFormatting, SquareCode, Strikethrough, Underline, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import type { Doc, MediaItem } from "@/shared/contract/community";
import { isSafeHref } from "@/shared/contract/community";
import { absoluteUrl } from "@/lib/api/config";
import { collapseWhitespace, docToHtml, domToDoc, inlineOnlyHtml, mediaFigureHtml } from "./doc-dom";
import { LoginRequiredError, MEDIA_ACCEPT, uploadMedia } from "./upload";

export type RichEditorHandle = {
  getDoc: () => Doc;
  focus: () => void;
  isEmpty: () => boolean;
};

type Props = {
  initial?: Doc | null;
  media?: MediaItem[];
  placeholder?: string;
  /** Maqola rejimi: sarlavha, ro'yxat, kod bloki kabi blok tugmalari ko'rinadi. */
  article?: boolean;
  onChange?: (textLength: number) => void;
  onPendingChange?: (pending: number) => void;
  onLoginRequired?: () => void;
};

type Active = Record<string, boolean>;

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function closestIn(node: Node | null, root: HTMLElement, test: (el: HTMLElement) => boolean): HTMLElement | null {
  let el: Node | null = node;
  while (el && el !== root) {
    if (el.nodeType === Node.ELEMENT_NODE && test(el as HTMLElement)) return el as HTMLElement;
    el = el.parentNode;
  }
  return null;
}

function unwrap(el: HTMLElement) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/** Tanlangan matn tugunlari (bo'lib) — bir nechta paragrafdagi tanlov ham to'g'ri o'raladi. */
function selectedTextNodes(range: Range, root: HTMLElement): Text[] {
  if (range.collapsed) return [];
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) nodes.push(range.commonAncestorContainer as Text);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (range.intersectsNode(node) && root.contains(node) && !node.parentElement?.closest("figure,[data-editor-ui]")) nodes.push(node);
  }
  return nodes
    .map((node) => {
      let target = node;
      if (target === range.endContainer && range.endOffset < target.length) target.splitText(range.endOffset);
      if (target === range.startContainer && range.startOffset > 0) target = target.splitText(range.startOffset);
      return target;
    })
    .filter((node) => node.length > 0);
}

/** Kursorni elementdan keyinga qo'yadi (ko'rinmas belgi orqali — brauzer kursorni ichkariga qaytarmasin). */
function exitElement(el: HTMLElement, sel: Selection) {
  const spacer = document.createTextNode("​");
  el.parentNode!.insertBefore(spacer, el.nextSibling);
  const range = document.createRange();
  range.setStart(spacer, 1);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Monospace va spoiler uchun: execCommand bunday belgilarni bilmaydi. */
function toggleInline(root: HTMLElement, match: (el: HTMLElement) => boolean, create: () => HTMLElement) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;

  const nodes = selectedTextNodes(range, root);
  const wrapped = nodes.map((node) => closestIn(node, root, match));
  if (nodes.length && wrapped.every(Boolean)) {
    new Set(wrapped).forEach((el) => el && unwrap(el));
    root.normalize();
    return;
  }
  if (!nodes.length) {
    // Kursor belgi ichida, hech narsa tanlanmagan: belgidan tashqariga chiqamiz,
    // shunda keyingi yozilgan matn spoiler/monospace bo'lib qolmaydi.
    const existing = closestIn(range.startContainer, root, match);
    if (existing) {
      exitElement(existing, sel);
      return;
    }
    // Hech narsa tanlanmagan: qalin (B) kabi — keyingi yoziladigan matn shu belgida bo'ladi.
    if (!range.collapsed) return;
    const wrapper = create();
    const spacer = document.createTextNode("​");
    wrapper.appendChild(spacer);
    range.insertNode(wrapper);
    const caret = document.createRange();
    caret.setStart(spacer, 1);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    return;
  }
  let first: Node | null = null, last: Node | null = null;
  for (const node of nodes) {
    if (closestIn(node, root, match)) continue;
    const wrapper = create();
    node.parentNode!.insertBefore(wrapper, node);
    wrapper.appendChild(node);
    first ??= wrapper;
    last = wrapper;
  }
  if (first && last) {
    const next = document.createRange();
    next.setStartBefore(first);
    next.setEndAfter(last);
    sel.removeAllRanges();
    sel.addRange(next);
  }
}

const isCode = (el: HTMLElement) => el.tagName === "CODE" && !el.closest("pre");
const isSpoiler = (el: HTMLElement) => el.dataset.spoiler !== undefined;

export const RichEditor = forwardRef<RichEditorHandle, Props>(function RichEditor(
  { initial, media = [], placeholder = "Matn yozing…", article = false, onChange, onPendingChange, onLoginRequired },
  ref,
) {
  const root = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<Active>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [pending, setPending] = useState(0);
  const [empty, setEmpty] = useState(!initial?.length);
  const initialHtml = useRef<string | null>(null);

  // Birinchi chizishda boshlang'ich matnni qo'yamiz (keyin muharrir o'zi boshqaradi).
  if (initialHtml.current === null) {
    initialHtml.current = initial?.length ? docToHtml(initial, new Map(media.map((item) => [item.id, item]))) : "<p><br></p>";
  }
  useEffect(() => {
    if (root.current && !root.current.innerHTML) root.current.innerHTML = initialHtml.current ?? "";
  }, []);

  useEffect(() => { onPendingChange?.(pending); }, [pending, onPendingChange]);

  const emit = useCallback(() => {
    const el = root.current;
    if (!el) return;
    const text = (el.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim();
    setEmpty(!text && !el.querySelector("figure"));
    onChange?.(text.length);
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    getDoc: () => (root.current ? domToDoc(root.current) : []),
    focus: () => root.current?.focus(),
    isEmpty: () => !root.current || (!(root.current.innerText ?? "").trim() && !root.current.querySelector("figure")),
  }), []);

  // Tugmalar holati (qalin yoqilganmi va h.k.).
  useEffect(() => {
    const update = () => {
      const el = root.current;
      const sel = window.getSelection();
      if (!el || !sel?.rangeCount || !el.contains(sel.anchorNode)) return;
      savedRange.current = sel.getRangeAt(0).cloneRange();
      const at = sel.anchorNode;
      const block = closestIn(at, el, (n) => /^(H2|H3|BLOCKQUOTE|PRE|UL|OL)$/.test(n.tagName));
      setActive({
        b: document.queryCommandState("bold"),
        i: document.queryCommandState("italic"),
        u: document.queryCommandState("underline"),
        s: document.queryCommandState("strikeThrough"),
        code: Boolean(closestIn(at, el, isCode)),
        spoiler: Boolean(closestIn(at, el, isSpoiler)),
        link: Boolean(closestIn(at, el, (n) => n.tagName === "A")),
        h2: block?.tagName === "H2",
        h3: block?.tagName === "H3",
        quote: block?.tagName === "BLOCKQUOTE",
        pre: block?.tagName === "PRE",
        ul: block?.tagName === "UL",
        ol: block?.tagName === "OL",
      });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  /** Belgilash muharrirdan chiqib ketgan bo'lsa (masalan, havola maydoniga), uni qaytaradi. */
  const restore = () => {
    const el = root.current;
    if (!el) return;
    const sel = window.getSelection();
    if (document.activeElement === el && sel?.rangeCount && el.contains(sel.anchorNode)) return;
    el.focus({ preventScroll: true });
    if (savedRange.current && sel && el.contains(savedRange.current.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  const run = (action: () => void) => {
    restore();
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* eski brauzer */ }
    action();
    emit();
  };

  const mark = (name: string) => {
    const el = root.current!;
    switch (name) {
      case "b": return run(() => exec("bold"));
      case "i": return run(() => exec("italic"));
      case "u": return run(() => exec("underline"));
      case "s": return run(() => exec("strikeThrough"));
      case "code": return run(() => toggleInline(el, isCode, () => document.createElement("code")));
      case "spoiler": return run(() => toggleInline(el, isSpoiler, () => { const s = document.createElement("span"); s.dataset.spoiler = ""; return s; }));
    }
  };

  const block = (tag: "h2" | "h3" | "blockquote" | "pre") => {
    const on = tag === "h2" ? active.h2 : tag === "h3" ? active.h3 : tag === "blockquote" ? active.quote : active.pre;
    // Chrome `formatBlock p` iqtibosni olib tashlamaydi — uni qo'lda ochamiz.
    if (tag === "blockquote" && on) return run(unquote);
    run(() => exec("formatBlock", on ? "p" : tag));
  };

  const unquote = () => {
    const el = root.current!;
    const sel = window.getSelection();
    const quote = sel?.rangeCount ? closestIn(sel.anchorNode, el, (n) => n.tagName === "BLOCKQUOTE") : null;
    if (!quote || !sel) return;
    const { anchorNode, anchorOffset } = sel;
    let target: HTMLElement;
    if (Array.from(quote.children).some((c) => /^(P|DIV|UL|OL|H2|H3|PRE|FIGURE)$/.test(c.tagName))) {
      target = quote.parentElement!;
      unwrap(quote);
    } else {
      target = document.createElement("p");
      while (quote.firstChild) target.appendChild(quote.firstChild);
      quote.replaceWith(target);
    }
    const caret = document.createRange();
    if (anchorNode && target.contains(anchorNode)) caret.setStart(anchorNode, anchorOffset);
    else caret.setStart(target, 0);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
  };

  /** Yangi qatorga o'tganda bo'sh spoiler/monospace qobig'i qolib ketmasin. */
  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    if ((e.nativeEvent as InputEvent).inputType === "insertParagraph") {
      const el = root.current!;
      const sel = window.getSelection();
      const mark = sel?.rangeCount ? closestIn(sel.anchorNode, el, (n) => isCode(n) || isSpoiler(n)) : null;
      if (mark && sel && !(mark.textContent ?? "").replace(/​/g, "")) {
        const parent = mark.parentElement!;
        unwrap(mark);
        const caret = document.createRange();
        caret.setStart(parent, 0);
        caret.collapse(true);
        sel.removeAllRanges();
        sel.addRange(caret);
      }
    }
    emit();
  };

  const clearFormat = () => run(() => {
    exec("removeFormat");
    exec("unlink");
    const el = root.current!;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    el.querySelectorAll<HTMLElement>("code, [data-spoiler]").forEach((node) => {
      if (range.intersectsNode(node) && !node.closest("pre")) unwrap(node);
    });
  });

  const openLink = () => {
    const el = root.current!;
    const sel = window.getSelection();
    const anchor = sel?.rangeCount ? closestIn(sel.anchorNode, el, (n) => n.tagName === "A") : null;
    if (!anchor && (!sel || sel.isCollapsed)) {
      toast("Avval havola qo'yiladigan matnni belgilang.");
      return;
    }
    if (sel?.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange();
    setLinkValue(anchor?.getAttribute("href") ?? "");
    setLinkOpen(true);
  };

  const applyLink = () => {
    let href = linkValue.trim();
    if (href && !/^[a-z]+:/i.test(href)) href = href.includes("@") && !href.includes("/") ? `mailto:${href}` : `https://${href}`;
    if (href && !isSafeHref(href)) {
      toast.error("Havola http:// yoki https:// bilan boshlansin.");
      return;
    }
    setLinkOpen(false);
    run(() => {
      const el = root.current!;
      const sel = window.getSelection();
      const anchor = sel?.rangeCount ? closestIn(sel.anchorNode, el, (n) => n.tagName === "A") : null;
      if (anchor && sel?.isCollapsed) {
        const range = document.createRange();
        range.selectNodeContents(anchor);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      if (!href) exec("unlink");
      else exec("createLink", href);
    });
  };

  // ── Matn ichiga rasm/video ─────────────────────────────────────────

  const insertFigure = useCallback((html: string): HTMLElement | null => {
    const el = root.current;
    if (!el) return null;
    const holder = document.createElement("div");
    holder.innerHTML = html;
    const figure = holder.firstElementChild as HTMLElement;
    const sel = window.getSelection();
    const range = savedRange.current && el.contains(savedRange.current.commonAncestorContainer) ? savedRange.current : null;
    // Joriy paragrafdan keyin qo'yamiz; kursor bo'lmasa — oxiriga.
    let anchor: Node | null = range ? range.startContainer : null;
    while (anchor && anchor.parentNode !== el) anchor = anchor.parentNode;
    if (anchor && anchor !== el) el.insertBefore(figure, anchor.nextSibling);
    else el.appendChild(figure);
    let after = figure.nextElementSibling;
    if (!after || after.tagName === "FIGURE") {
      after = document.createElement("p");
      after.innerHTML = "<br>";
      el.insertBefore(after, figure.nextSibling);
    }
    const caret = document.createRange();
    caret.setStart(after, 0);
    caret.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(caret);
    savedRange.current = caret.cloneRange();
    return figure;
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    const list = files.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!list.length) return;
    for (const file of list) {
      const uploadId = crypto.randomUUID();
      const preview = URL.createObjectURL(file);
      const figure = insertFigure(mediaFigureHtml({ id: "", kind: file.type.startsWith("video/") ? "video" : "image", url: preview }, "", uploadId));
      if (!figure) continue;
      setPending((n) => n + 1);
      emit();
      const bar = figure.querySelector<HTMLElement>(".rt-media-progress i");
      uploadMedia(file, (f) => { if (bar) bar.style.width = `${Math.round(f * 100)}%`; })
        .then((item) => {
          figure.dataset.mediaId = item.id;
          delete figure.dataset.upload;
          const element = figure.querySelector<HTMLImageElement | HTMLVideoElement>("img, video");
          if (element) element.src = item.kind === "video" ? `${absoluteUrl(item.url)}#t=0.1` : absoluteUrl(item.url);
          figure.querySelector(".rt-media-progress")?.remove();
        })
        .catch((error: unknown) => {
          figure.remove();
          if (error instanceof LoginRequiredError) onLoginRequired?.();
          else toast.error(error instanceof Error ? error.message : "Fayl yuklanmadi.");
        })
        .finally(() => {
          URL.revokeObjectURL(preview);
          setPending((n) => n - 1);
          emit();
        });
    }
  }, [emit, insertFigure, onLoginRequired]);

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    // Rasm izohiga faqat oddiy matn.
    if (target.closest("figcaption")) {
      exec("insertText", text.replace(/\s+/g, " "));
      return;
    }
    const html = e.clipboardData.getData("text/html");
    if (html) {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      collapseWhitespace(parsed.body);
      const doc = domToDoc(parsed.body).filter((b) => b.type !== "media");
      const inline = inlineOnlyHtml(doc);
      if (doc.length) {
        exec("insertHTML", inline ?? docToHtml(doc));
        emit();
        return;
      }
    }
    exec("insertText", text);
    emit();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    const target = e.target as HTMLElement;
    if (target.closest("figcaption")) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }
    if (!mod) return;
    const key = e.key.toLowerCase();
    // Telegram Desktop bilan bir xil tugmalar.
    if (e.shiftKey && key === "x") { e.preventDefault(); mark("s"); }
    else if (e.shiftKey && key === "m") { e.preventDefault(); mark("code"); }
    else if (e.shiftKey && key === "p") { e.preventDefault(); mark("spoiler"); }
    else if (e.shiftKey && key === "n") { e.preventDefault(); clearFormat(); }
    else if (key === "k") { e.preventDefault(); openLink(); }
    else if (key === "u" && !e.shiftKey) { e.preventDefault(); mark("u"); }
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const remove = (e.target as HTMLElement).closest(".rt-media-remove");
    if (remove) {
      e.preventDefault();
      remove.closest("figure")?.remove();
      emit();
    }
  };

  const tool = (key: string, label: string, icon: React.ReactNode, action: () => void, pressed?: boolean) => (
    <button
      key={key}
      type="button"
      className="rt-tool"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      // Tugma bosilganda muharrirdagi belgilash yo'qolmasin.
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
    >
      {icon}
    </button>
  );

  return (
    <div className={`rt-editor-wrap${article ? " is-article" : ""}`}>
      <div className="rt-toolbar" role="toolbar" aria-label="Matnni formatlash">
        {linkOpen ? (
          <form className="rt-linkbar" onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
            <Link2 size={17} />
            <input autoFocus type="text" inputMode="url" placeholder="https://..." value={linkValue} onChange={(e) => setLinkValue(e.target.value)} aria-label="Havola manzili" />
            <button type="submit" className="rt-tool" aria-label="Havolani qo'yish" title="Qo'yish"><Check size={18} /></button>
            <button type="button" className="rt-tool" aria-label="Bekor qilish" title="Bekor qilish" onClick={() => { setLinkOpen(false); restore(); }}><X size={18} /></button>
          </form>
        ) : (
          <>
            {tool("b", "Qalin (Ctrl+B)", <Bold size={18} />, () => mark("b"), active.b)}
            {tool("i", "Kursiv (Ctrl+I)", <Italic size={18} />, () => mark("i"), active.i)}
            {tool("u", "Tagiga chizilgan (Ctrl+U)", <Underline size={18} />, () => mark("u"), active.u)}
            {tool("s", "Ustidan chizilgan (Ctrl+Shift+X)", <Strikethrough size={18} />, () => mark("s"), active.s)}
            {tool("code", "Monospace (Ctrl+Shift+M)", <Code size={18} />, () => mark("code"), active.code)}
            {tool("spoiler", "Spoiler — yashirin matn (Ctrl+Shift+P)", <EyeOff size={18} />, () => mark("spoiler"), active.spoiler)}
            {tool("link", "Havola (Ctrl+K)", <Link2 size={18} />, openLink, active.link)}
            <span className="rt-sep" aria-hidden="true" />
            {tool("h2", "Sarlavha", <Heading2 size={18} />, () => block("h2"), active.h2)}
            {tool("h3", "Kichik sarlavha", <Heading3 size={18} />, () => block("h3"), active.h3)}
            {tool("quote", "Iqtibos", <Quote size={18} />, () => block("blockquote"), active.quote)}
            {tool("ul", "Ro'yxat", <List size={18} />, () => run(() => exec("insertUnorderedList")), active.ul)}
            {tool("ol", "Raqamli ro'yxat", <ListOrdered size={18} />, () => run(() => exec("insertOrderedList")), active.ol)}
            {article && tool("pre", "Kod bloki", <SquareCode size={18} />, () => block("pre"), active.pre)}
            {article && tool("hr", "Ajratgich chiziq", <Minus size={18} />, () => run(() => exec("insertHorizontalRule")))}
            <span className="rt-sep" aria-hidden="true" />
            {tool("media", "Matn ichiga rasm yoki video", <ImagePlus size={18} />, () => {
              const sel = window.getSelection();
              if (sel?.rangeCount && root.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
              fileInput.current?.click();
            })}
            {tool("clear", "Formatni tozalash (Ctrl+Shift+N)", <RemoveFormatting size={18} />, clearFormat)}
          </>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        hidden
        onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
      <div
        ref={root}
        className={`rt-editor rt-content${empty ? " is-empty" : ""}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        spellCheck
        onInput={onInput}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onClick={onClick}
        onFocus={() => { try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* eski brauzer */ } }}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files);
          if (!files.length) return;
          e.preventDefault();
          void addFiles(files);
        }}
      />
      {pending > 0 && <p className="rt-pending" role="status">Fayl yuklanmoqda… ({pending})</p>}
    </div>
  );
});

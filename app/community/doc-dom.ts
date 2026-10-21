/**
 * Formatlangan matn (bloklar) ⇄ muharrir DOM'i.
 *
 * `domToDoc` istalgan HTML'ni (muharrir, boshqa saytdan paste) oq ro'yxat bo'yicha
 * bloklarga aylantiradi — ruxsat etilmagan teg va atributlar tashlab yuboriladi.
 * `docToHtml` esa bloklardan muharrirga qayta yuklanadigan HTML yasaydi.
 */
import { isSafeHref, type Block, type Doc, type InlineText, type MediaItem, type TextMark } from "@/shared/contract/community";
import { absoluteUrl } from "@/lib/api/config";

const MARK_ORDER: TextMark[] = ["b", "i", "u", "s", "code", "spoiler"];

const BLOCK_TAGS = new Set([
  "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "UL", "OL", "LI",
  "FIGURE", "HR", "SECTION", "ARTICLE", "HEADER", "FOOTER", "ASIDE", "MAIN", "TABLE", "TBODY", "THEAD", "TR", "TD", "TH", "DL", "DT", "DD", "ADDRESS",
]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "OBJECT", "SVG", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "IMG", "VIDEO", "AUDIO", "CANVAS", "META", "LINK", "HEAD", "TITLE"]);

type Ctx = { marks: TextMark[]; href?: string };

function marksOf(el: HTMLElement, ctx: Ctx): Ctx {
  const marks = new Set(ctx.marks);
  let href = ctx.href;
  switch (el.tagName) {
    case "B": case "STRONG": marks.add("b"); break;
    case "I": case "EM": case "CITE": case "DFN": marks.add("i"); break;
    case "U": case "INS": marks.add("u"); break;
    case "S": case "STRIKE": case "DEL": marks.add("s"); break;
    case "CODE": case "KBD": case "SAMP": case "TT": marks.add("code"); break;
    case "A": {
      const raw = el.getAttribute("href")?.trim() ?? "";
      if (isSafeHref(raw)) href = raw;
      break;
    }
  }
  if (el.dataset.spoiler !== undefined || el.classList.contains("tg-spoiler")) marks.add("spoiler");
  // Boshqa saytlardan paste qilinganda formatlash ko'pincha `style` orqali keladi.
  const style = el.style;
  if (style) {
    const weight = style.fontWeight;
    if (weight === "bold" || weight === "bolder" || Number(weight) >= 600) marks.add("b");
    if (weight === "normal" || (Number(weight) > 0 && Number(weight) < 600)) marks.delete("b");
    if (style.fontStyle === "italic") marks.add("i");
    const decoration = `${style.textDecoration} ${style.textDecorationLine}`;
    if (decoration.includes("underline")) marks.add("u");
    if (decoration.includes("line-through")) marks.add("s");
  }
  return { marks: MARK_ORDER.filter((m) => marks.has(m)), href };
}

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isUi(el: HTMLElement): boolean {
  return el.dataset.editorUi !== undefined;
}

/** Inline mazmunni yig'adi. Ichidagi blok elementlar yangi qator bilan ajratiladi. */
function collectInline(node: Node, ctx: Ctx, out: InlineText[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent ?? "").replace(/ /g, " ").replace(/[​﻿]/g, "");
    if (t) out.push({ t, ...(ctx.marks.length ? { m: ctx.marks } : {}), ...(ctx.href ? { href: ctx.href } : {}) });
    return;
  }
  if (!isElement(node) || SKIP_TAGS.has(node.tagName) || isUi(node)) return;
  if (node.tagName === "BR") {
    out.push({ t: "\n" });
    return;
  }
  const block = BLOCK_TAGS.has(node.tagName);
  if (block && out.length && !out[out.length - 1].t.endsWith("\n")) out.push({ t: "\n" });
  const next = marksOf(node, ctx);
  node.childNodes.forEach((child) => collectInline(child, next, out));
  if (block && out.length && !out[out.length - 1].t.endsWith("\n")) out.push({ t: "\n" });
}

const sameFormat = (a: InlineText, b: InlineText) =>
  a.href === b.href && (a.m ?? []).join() === (b.m ?? []).join();

/** Qo'shni bir xil formatdagi bo'laklarni birlashtiradi, chetdagi bo'shliqni kesadi. */
export function tidyInlines(items: InlineText[]): InlineText[] {
  const merged: InlineText[] = [];
  for (const item of items) {
    const last = merged[merged.length - 1];
    // Yangi qator formatga bog'liq emas — oldingi bo'lakka qo'shamiz.
    if (last && (sameFormat(last, item) || item.t === "\n")) last.t += item.t;
    else merged.push({ ...item });
  }
  while (merged.length && !merged[0].t.replace(/^[\s\n]+/, "")) merged.shift();
  while (merged.length && !merged[merged.length - 1].t.replace(/[\s\n]+$/, "")) merged.pop();
  if (merged.length) {
    merged[0].t = merged[0].t.replace(/^[\n ]+/, "");
    const last = merged[merged.length - 1];
    last.t = last.t.replace(/[\n ]+$/, "");
  }
  return merged.map((item) => {
    // Faqat bo'shliqdan iborat bo'lakka ko'rinmas belgilar kerak emas.
    if (!item.t.trim() && item.m) return { t: item.t };
    return item;
  });
}

function inlineOf(el: HTMLElement, ctx: Ctx = { marks: [] }): InlineText[] {
  const out: InlineText[] = [];
  el.childNodes.forEach((child) => collectInline(child, ctx, out));
  return tidyInlines(out);
}

function hasBlockChild(el: HTMLElement): boolean {
  return Array.from(el.children).some((child) => BLOCK_TAGS.has(child.tagName) || (child as HTMLElement).dataset?.mediaId !== undefined);
}

export function domToDoc(root: HTMLElement): Doc {
  const blocks: Block[] = [];
  let pending: InlineText[] = [];

  const flush = () => {
    const c = tidyInlines(pending);
    if (c.length) blocks.push({ type: "p", c });
    pending = [];
  };

  const walk = (node: Node, ctx: Ctx) => {
    if (node.nodeType === Node.TEXT_NODE) {
      collectInline(node, ctx, pending);
      return;
    }
    if (!isElement(node) || isUi(node)) return;
    const el = node;
    if (el.dataset.mediaId !== undefined || el.tagName === "FIGURE") {
      flush();
      const id = el.dataset.mediaId;
      const caption = el.querySelector("figcaption")?.textContent?.trim();
      if (id && el.dataset.upload === undefined) blocks.push({ type: "media", id, ...(caption ? { caption } : {}) });
      return;
    }
    if (SKIP_TAGS.has(el.tagName)) return;
    switch (el.tagName) {
      case "BR":
        flush();
        return;
      case "HR":
        flush();
        blocks.push({ type: "hr" });
        return;
      case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": {
        flush();
        const c = inlineOf(el, marksOf(el, ctx));
        if (c.length) blocks.push({ type: "h", level: el.tagName === "H1" || el.tagName === "H2" ? 2 : 3, c });
        return;
      }
      case "BLOCKQUOTE": {
        flush();
        const c = inlineOf(el, ctx);
        if (c.length) blocks.push({ type: "quote", c });
        return;
      }
      case "PRE": {
        flush();
        const text = (el.textContent ?? "").replace(/ /g, " ").replace(/^\n+|\s+$/g, "");
        if (text) blocks.push({ type: "code", text });
        return;
      }
      case "UL": case "OL": {
        flush();
        const items = Array.from(el.children)
          .filter((child) => child.tagName === "LI")
          .map((li) => inlineOf(li as HTMLElement, ctx))
          .filter((item) => item.length);
        if (items.length) blocks.push({ type: "list", ordered: el.tagName === "OL", items: items.slice(0, 100) });
        return;
      }
    }
    if (BLOCK_TAGS.has(el.tagName)) {
      flush();
      const next = marksOf(el, ctx);
      if (hasBlockChild(el)) {
        el.childNodes.forEach((child) => walk(child, next));
        flush();
      } else {
        const c = inlineOf(el, next);
        if (c.length) blocks.push({ type: "p", c });
      }
      return;
    }
    // Ildiz darajasidagi inline element (b, span, a ...).
    if (hasBlockChild(el)) {
      const next = marksOf(el, ctx);
      el.childNodes.forEach((child) => walk(child, next));
      return;
    }
    collectInline(el, ctx, pending);
  };

  root.childNodes.forEach((child) => walk(child, { marks: [] }));
  flush();
  return blocks;
}

/** Boshqa saytdan paste qilingan HTML'dagi formatlash bo'shliqlarini yig'adi (brauzer ko'rsatganidek). */
export function collapseWhitespace(root: HTMLElement): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (node.parentElement?.closest("pre")) continue;
    node.textContent = (node.textContent ?? "").replace(/[\t\n\r ]+/g, " ");
  }
}

// ── Bloklar → HTML (faqat muharrir uchun; matn doim escape qilinadi) ──

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function inlineHtml(items: InlineText[]): string {
  return items
    .map((item) => {
      let html = escapeHtml(item.t).replace(/\n/g, "<br>");
      const marks = item.m ?? [];
      if (marks.includes("spoiler")) html = `<span data-spoiler="">${html}</span>`;
      if (marks.includes("code")) html = `<code>${html}</code>`;
      if (marks.includes("s")) html = `<s>${html}</s>`;
      if (marks.includes("u")) html = `<u>${html}</u>`;
      if (marks.includes("i")) html = `<i>${html}</i>`;
      if (marks.includes("b")) html = `<b>${html}</b>`;
      if (item.href && isSafeHref(item.href)) html = `<a href="${escapeHtml(item.href)}">${html}</a>`;
      return html;
    })
    .join("");
}

export function mediaFigureHtml(item: Pick<MediaItem, "id" | "kind" | "url">, caption = "", uploadId?: string): string {
  const src = escapeHtml(absoluteUrl(item.url));
  const body = item.kind === "video"
    ? `<video src="${src}#t=0.1" preload="metadata" muted playsinline></video>`
    : `<img src="${src}" alt="">`;
  const upload = uploadId ? ` data-upload="${escapeHtml(uploadId)}"` : "";
  return `<figure class="rt-media" contenteditable="false" data-media-id="${escapeHtml(item.id)}" data-kind="${item.kind}"${upload}>${body}`
    + `<button type="button" class="rt-media-remove" data-editor-ui="" aria-label="Olib tashlash" title="Olib tashlash">×</button>`
    + (uploadId ? `<span class="rt-media-progress" data-editor-ui=""><i style="width:0%"></i></span>` : "")
    + `<figcaption contenteditable="true" data-placeholder="Izoh (ixtiyoriy)">${escapeHtml(caption)}</figcaption></figure>`;
}

export function blockHtml(block: Block, media: Map<string, MediaItem>): string {
  switch (block.type) {
    case "p": return `<p>${inlineHtml(block.c) || "<br>"}</p>`;
    case "h": return `<h${block.level}>${inlineHtml(block.c)}</h${block.level}>`;
    case "quote": return `<blockquote>${inlineHtml(block.c)}</blockquote>`;
    case "code": return `<pre>${escapeHtml(block.text)}</pre>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${tag}>`;
    }
    case "media": {
      const item = media.get(block.id);
      return item ? mediaFigureHtml(item, block.caption) : "";
    }
    case "hr": return "<hr>";
  }
}

export function docToHtml(doc: Doc, media: Map<string, MediaItem> = new Map()): string {
  return doc.map((block) => blockHtml(block, media)).join("");
}

/** Bitta paragrafli paste'ni joriy qatorga inline qo'yish uchun. */
export function inlineOnlyHtml(doc: Doc): string | null {
  if (doc.length !== 1 || doc[0].type !== "p") return null;
  return inlineHtml(doc[0].c);
}

/**
 * E-kitob sahifalash: matn bloklarini aniq o'lchangan sahifa qutisiga ketma-ket joylaydi. Xatboshi so'z
 * chegarasida, she'r qator chegarasida bo'linadi; bob (#) va `---` yangi sahifadan boshlanadi; sarlavha
 * sahifa oxirida yolg'iz qolmaydi.
 *
 * O'lchash va ko'rsatish bitta `renderFrag` orqali — shuning uchun sahifa ekranda ham aynan o'lchangandek
 * chiqadi. Matn DOM'ga faqat textContent sifatida tushadi (HTML talqin qilinmaydi).
 */
import { runsText, type EbookBlock, type EbookLine } from "@/shared/ebook-markup";

export type Frag =
  | { t: "h1" | "h2" | "h3"; block: number; runs: EbookLine }
  /** `from` — blok matnidagi boshlanish o'rni; `cont` — oldingi sahifadan davom (xatboshi chekinmaydi). */
  | { t: "p"; block: number; runs: EbookLine; from: number; cont: boolean }
  /** `from` — blokdagi birinchi qator raqami. */
  | { t: "verse" | "center" | "right"; block: number; lines: EbookLine[]; from: number };

export type Page = {
  frags: Frag[];
  /** Sahifa boshidagi joy: qaytib kelganda shu joy topiladi. */
  anchor: Anchor;
  /** Yuqori yozuv: shu sahifagacha oxirgi bob/bo'lim nomi. */
  chapter: string;
};

export type Anchor = { block: number; offset: number };

const RUN_TAGS = { bold: "strong", italic: "em" } as const;

function appendRuns(parent: HTMLElement, runs: EbookLine) {
  for (const run of runs) {
    let node: Node = document.createTextNode(run.text);
    if (run.italic) {
      const em = document.createElement(RUN_TAGS.italic);
      em.appendChild(node);
      node = em;
    }
    if (run.bold) {
      const strong = document.createElement(RUN_TAGS.bold);
      strong.appendChild(node);
      node = strong;
    }
    parent.appendChild(node);
  }
}

const HEADING_TAG = { h1: "h2", h2: "h3", h3: "h4" } as const;

export function renderFrag(frag: Frag): HTMLElement {
  switch (frag.t) {
    case "h1":
    case "h2":
    case "h3": {
      const el = document.createElement(HEADING_TAG[frag.t]);
      el.className = `eb-${frag.t}`;
      appendRuns(el, frag.runs);
      return el;
    }
    case "p": {
      const el = document.createElement("p");
      el.className = frag.cont ? "eb-p eb-cont" : "eb-p";
      appendRuns(el, frag.runs);
      return el;
    }
    default: {
      const el = document.createElement("div");
      el.className = `eb-${frag.t}${frag.from > 0 ? " eb-cont" : ""}`;
      for (const line of frag.lines) {
        const span = document.createElement("span");
        span.className = "eb-line";
        appendRuns(span, line);
        el.appendChild(span);
      }
      return el;
    }
  }
}

/** `runs` ichidan [start, end) belgilar oralig'i. */
export function sliceRuns(runs: EbookLine, start: number, end = Infinity): EbookLine {
  const out: EbookLine = [];
  let at = 0;
  for (const run of runs) {
    const from = Math.max(start, at);
    const to = Math.min(end, at + run.text.length);
    if (to > from) out.push({ ...run, text: run.text.slice(from - at, to - at) });
    at += run.text.length;
    if (at >= end) break;
  }
  return out;
}

type Options = {
  signal?: AbortSignal;
  /** Har bir tayyor sahifa soni bilan (yuklanish ko'rsatkichi uchun). */
  onProgress?: (pages: number) => void;
};

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * `box` — ko'rinmas, haqiqiy sahifa matni bilan bir xil o'lchamli quti (`position: relative`).
 * Brauzer qotib qolmasligi uchun har ~12 ms da navbatni bo'shatadi.
 */
export async function paginate(blocks: EbookBlock[], box: HTMLElement, options: Options = {}): Promise<Page[]> {
  const height = box.clientHeight;
  const pages: Page[] = [];
  let frags: Frag[] = [];
  let chapter = "";
  let pageChapter = "";
  let budget = performance.now();

  const fits = () => {
    const last = box.lastElementChild as HTMLElement | null;
    return !last || last.offsetTop + last.offsetHeight <= height + 0.5;
  };
  const place = (frag: Frag) => {
    frags.push(frag);
    box.appendChild(renderFrag(frag));
  };
  const unplace = () => {
    frags.pop();
    box.lastElementChild?.remove();
  };
  const anchorOf = (frag: Frag): Anchor => ({ block: frag.block, offset: "from" in frag ? frag.from : 0 });
  const closePage = () => {
    if (!frags.length) return;
    pages.push({ frags, anchor: anchorOf(frags[0]), chapter: pageChapter });
    frags = [];
    box.replaceChildren();
    pageChapter = chapter;
    options.onProgress?.(pages.length);
  };
  /** Yangi sahifaga o'tish; oxirgi sarlavhalar keyingi matn bilan birga ko'chadi. */
  const carryHeadingsOver = () => {
    const carried: Frag[] = [];
    while (frags.length > 1 && /^h[123]$/.test(frags[frags.length - 1].t)) {
      carried.unshift(frags[frags.length - 1]);
      unplace();
    }
    closePage();
    for (const frag of carried) place(frag);
  };

  /** Xatboshi: sig'magan qismi so'z chegarasida keyingi sahifaga o'tadi. */
  const placeParagraph = (index: number, runs: EbookLine) => {
    const text = runsText(runs);
    let from = 0;
    while (from < text.length) {
      place({ t: "p", block: index, runs: sliceRuns(runs, from), from, cont: from > 0 });
      if (fits()) return;
      unplace();
      // So'z chegaralaridan sig'adiganining eng uzuni (ikkilik qidiruv).
      const cuts: number[] = [];
      for (let i = text.indexOf(" ", from); i !== -1; i = text.indexOf(" ", i + 1)) cuts.push(i);
      let lo = 0;
      let hi = cuts.length - 1;
      let best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        place({ t: "p", block: index, runs: sliceRuns(runs, from, cuts[mid]), from, cont: from > 0 });
        if (fits()) {
          best = mid;
          lo = mid + 1;
        } else hi = mid - 1;
        unplace();
      }
      if (best >= 0) {
        place({ t: "p", block: index, runs: sliceRuns(runs, from, cuts[best]), from, cont: from > 0 });
        closePage();
        from = cuts[best] + 1;
      } else if (frags.length) carryHeadingsOver();
      else {
        // Bo'sh sahifaga bitta so'z ham sig'masa (juda tor oyna) — baribir joylab, davom etamiz.
        const end = cuts[0] ?? text.length;
        place({ t: "p", block: index, runs: sliceRuns(runs, from, end), from, cont: from > 0 });
        closePage();
        from = end + 1;
      }
    }
  };

  /** She'r / o'rta / o'ng guruh: qator chegarasida bo'linadi. */
  const placeLines = (index: number, t: "verse" | "center" | "right", lines: EbookLine[]) => {
    let from = 0;
    while (from < lines.length) {
      place({ t, block: index, lines: lines.slice(from), from });
      if (fits()) return;
      unplace();
      let count = lines.length - from - 1;
      while (count > 0) {
        place({ t, block: index, lines: lines.slice(from, from + count), from });
        if (fits()) break;
        unplace();
        count--;
      }
      if (count > 0) {
        closePage();
        from += count;
      } else if (frags.length) carryHeadingsOver();
      else {
        place({ t, block: index, lines: lines.slice(from, from + 1), from });
        closePage();
        from += 1;
      }
    }
  };

  for (let index = 0; index < blocks.length; index++) {
    if (performance.now() - budget > 12) {
      await yieldToBrowser();
      if (options.signal?.aborted) throw new DOMException("Bekor qilindi", "AbortError");
      budget = performance.now();
    }
    const block = blocks[index];

    switch (block.kind) {
      case "break":
        closePage();
        break;
      case "h1":
      case "h2":
      case "h3": {
        if (block.kind === "h1") closePage();
        if (block.kind !== "h3") {
          chapter = block.text;
          if (!frags.length) pageChapter = chapter;
        }
        const frag: Frag = { t: block.kind, block: index, runs: block.runs };
        place(frag);
        if (!fits()) {
          unplace();
          carryHeadingsOver();
          place(frag);
        }
        break;
      }
      case "p":
        placeParagraph(index, block.runs);
        break;
      default:
        placeLines(index, block.kind, block.lines);
    }
  }
  closePage();
  return pages;
}

/** Joy (blok, o'rin) qaysi sahifada: boshlanishi undan oldin bo'lgan oxirgi sahifa. */
export function pageOfAnchor(pages: Page[], anchor: Anchor): number {
  let found = 0;
  for (let i = 0; i < pages.length; i++) {
    const a = pages[i].anchor;
    if (a.block < anchor.block || (a.block === anchor.block && a.offset <= anchor.offset)) found = i;
    else break;
  }
  return found;
}

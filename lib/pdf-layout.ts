/**
 * PDF sahifalaridagi joylashgan matn qatorlaridan e-kitob belgilashini (`shared/ebook-markup.ts`) tiklaydi.
 * PDF'da xatboshi, sarlavha, she'r degan tushuncha yo'q — faqat koordinatali qatorlar bor. Shuning uchun
 * qoidalar taxminiy: shrift o'lchami (sarlavha), o'rtaga/o'ngga tekislash, chekinish (xatboshi), qisqa va
 * kursiv qatorlar (she'r), takrorlanuvchi kolontitul va sahifa raqamlari (olib tashlanadi).
 * Natija muharrirda ko'rib tuzatiladi. Tashqi importsiz — `node --experimental-strip-types` bilan sinovdan o'tadi.
 */

export type PdfRun = { text: string; bold: boolean; italic: boolean };
/** `y` — qator asosining sahifa tepasidan masofasi (pastga qarab o'sadi). */
export type PdfItem = PdfRun & { x: number; y: number; width: number; size: number };
export type PdfLine = { runs: PdfRun[]; x0: number; x1: number; y: number; size: number };
export type PdfPage = { width: number; lines: PdfLine[] };

const lineText = (line: PdfLine) => line.runs.map((r) => r.text).join("");

/** Bir xil balandlikdagi bo'laklarni qatorlarga yig'adi (chapdan o'ngga). */
export function itemsToLines(items: PdfItem[]): PdfLine[] {
  const sorted = items.filter((i) => i.text).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: { items: PdfItem[]; y: number; size: number }[] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(item.y - last.y) < Math.max(item.size, last.size) * 0.45) last.items.push(item);
    else lines.push({ items: [item], y: item.y, size: item.size });
  }
  return lines.flatMap(({ items: row, y }) => {
    row.sort((a, b) => a.x - b.x);
    const runs: PdfRun[] = [];
    let end = -Infinity;
    for (const item of row) {
      const gap = item.x - end;
      const prev = runs[runs.length - 1];
      const needsSpace = prev && gap > item.size * 0.18 && !/\s$/.test(prev.text) && !/^\s/.test(item.text);
      const text = (needsSpace ? " " : "") + item.text;
      if (prev && prev.bold === item.bold && prev.italic === item.italic) prev.text += text;
      else runs.push({ text, bold: item.bold, italic: item.italic });
      end = Math.max(end, item.x + item.width);
    }
    const trimmed = runs.map((r) => ({ ...r, text: r.text.replace(/\s+/g, " ") }));
    if (!trimmed.map((r) => r.text).join("").trim()) return [];
    return [{ runs: trimmed, x0: row[0].x, x1: end, y, size: Math.max(...row.map((i) => i.size)) }];
  });
}

function weightedMedian(values: { value: number; weight: number }[]): number {
  const list = values.filter((v) => v.weight > 0).sort((a, b) => a.value - b.value);
  const total = list.reduce((sum, v) => sum + v.weight, 0);
  let acc = 0;
  for (const v of list) {
    acc += v.weight;
    if (acc >= total / 2) return v.value;
  }
  return list[list.length - 1]?.value ?? 12;
}

/** Kolontitul kaliti: matn (raqamlarsiz) va shrift o'lchami — shu nomdagi bob sarlavhasi bilan adashmasin. */
const furnitureKey = (line: PdfLine) => `${Math.round(line.size)}|${lineText(line).replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase()}`;
const PAGE_NUMBER = /^[-–—\s]*(\d{1,4}|[ivxlcdm]{1,6})[-–—\s]*$/i;

/** Sahifa raqamlari va har sahifada takrorlanadigan yuqori/pastki yozuvlar. */
function dropFurniture(pages: PdfPage[]): PdfPage[] {
  const edgeCount = new Map<string, number>();
  for (const page of pages) {
    const edges = new Set([page.lines[0], page.lines[1], page.lines[page.lines.length - 1], page.lines[page.lines.length - 2]].filter(Boolean).map(furnitureKey));
    for (const key of edges) edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
  }
  const repeated = (line: PdfLine) => {
    const count = edgeCount.get(furnitureKey(line)) ?? 0;
    return pages.length >= 4 && count >= 3 && count >= pages.length * 0.25;
  };
  return pages.map((page) => {
    const last = page.lines.length - 1;
    const lines = page.lines.filter((line, index) => {
      const edge = index <= 1 || index >= last - 1;
      return !(edge && (PAGE_NUMBER.test(lineText(line)) || repeated(line)));
    });
    return { ...page, lines };
  });
}

type Style = { bold?: false; italic?: false };

/** Bo'laklarni belgilangan matnga: `**qalin**`, `*kursiv*`; `drop` — blok o'zi beradigan uslub (sarlavha, she'r). */
function styled(runs: PdfRun[], drop: Style = {}): string {
  const merged: PdfRun[] = [];
  for (const run of runs) {
    const bold = drop.bold === false ? false : run.bold;
    const italic = drop.italic === false ? false : run.italic;
    const text = run.text.replace(/[\\*]/g, "\\$&");
    const last = merged[merged.length - 1];
    // Faqat bo'shliqdan iborat bo'lak uslubni bo'lmasin.
    if (last && (last.bold === bold && last.italic === italic || !text.trim())) last.text += text;
    else merged.push({ text, bold, italic });
  }
  return merged
    .map((run) => {
      if (!run.bold && !run.italic) return run.text;
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text) ?? ["", "", run.text, ""];
      const mark = run.bold && run.italic ? "***" : run.bold ? "**" : "*";
      return core ? `${lead}${mark}${core}${mark}${trail}` : run.text;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

type Kind = "heading" | "center" | "right" | "verse" | "text";
type Classified = { line: PdfLine; kind: Kind; level: 1 | 2; indented: boolean; short: boolean; gap: boolean };

/** Xatboshi chekinishi: to'liq qatorlar orasida eng ko'p uchraydigan chekinish (topilmasa null). */
function paragraphIndent(pages: PdfPage[]): number | null {
  const counts = new Map<number, number>();
  for (const page of pages) {
    const left = Math.min(...page.lines.map((l) => l.x0));
    for (const line of page.lines) {
      const indent = Math.round(line.x0 - left);
      if (indent >= 6 && lineText(line).length > 40) counts.set(indent, (counts.get(indent) ?? 0) + 1);
    }
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return best && best[1] >= 3 ? best[0] : null;
}

function classifyPage(page: PdfPage, body: number, lineGap: number, indent: number | null): Classified[] {
  const wide = page.lines.filter((l) => lineText(l).trim().length >= 25);
  const basis = wide.length >= 2 ? wide : page.lines;
  const left = Math.min(...basis.map((l) => l.x0));
  const right = Math.max(...basis.map((l) => l.x1));
  const width = Math.max(1, right - left);

  const rows = page.lines.map((line, index): Classified => {
    const text = lineText(line).trim();
    const mid = (line.x0 + line.x1) / 2;
    const allBold = line.runs.every((r) => r.bold || !r.text.trim());
    const allItalic = line.runs.every((r) => r.italic || !r.text.trim());
    const caps = /\p{Lu}/u.test(text) && text === text.toLocaleUpperCase() && text.length <= 90;
    const big = line.size >= body * 1.18;
    const leftGap = line.x0 - left;
    // Xatboshining qisqa birinchi qatori tasodifan o'rtada turib qolmasin.
    const paragraphStart = indent !== null && Math.abs(leftGap - indent) < 2 && !allBold && !caps && !big;
    const centered = !paragraphStart && Math.abs(leftGap - (right - line.x1)) < width * 0.03 && leftGap > width * 0.04;
    // Kursiv qator sarlavha bo'lishi uchun shrifti katta bo'lsin (aks holda bu she'r yoki yorliq, masalan «BAYT»).
    const heading = text.length <= 120 && (big || (!allItalic && ((centered && (allBold || caps)) || (allBold && caps && text.length <= 60))));
    const rightAligned = !centered && line.x0 - left > width * 0.4 && right - line.x1 < width * 0.05;
    const prev = page.lines[index - 1];
    const kind: Kind = heading ? "heading" : centered ? "center" : rightAligned ? "right" : allItalic && text.length < 120 ? "verse" : "text";
    return {
      line,
      kind,
      level: line.size >= body * 1.35 ? 1 : 2,
      indented: line.x0 - left > width * 0.025,
      short: right - line.x1 > width * 0.1,
      gap: Boolean(prev && line.y - prev.y > lineGap * 1.7),
    };
  });
  // Kursivsiz she'r: ketma-ket kamida ikkita chekingan va qisqa qator.
  const loose = (r: Classified) => r.kind === "text" && r.indented && r.short;
  rows.forEach((row, i) => {
    if (loose(row) && ((rows[i - 1] && (loose(rows[i - 1]) || rows[i - 1].kind === "verse") && !row.gap) || (rows[i + 1] && loose(rows[i + 1]) && !rows[i + 1].gap))) row.kind = "verse";
  });
  return rows;
}

/** PDF sahifalaridan e-kitob belgilashi. */
export function pagesToMarkup(input: PdfPage[]): string {
  const pages = dropFurniture(input.filter((p) => p.lines.length));
  const all = pages.flatMap((p) => p.lines);
  const body = weightedMedian(all.map((l) => ({ value: Math.round(l.size * 2) / 2, weight: lineText(l).length })));
  const gaps: { value: number; weight: number }[] = [];
  for (const page of pages) for (let i = 1; i < page.lines.length; i++) gaps.push({ value: page.lines[i].y - page.lines[i - 1].y, weight: 1 });
  const lineGap = Math.max(body, weightedMedian(gaps.filter((g) => g.value > 0)));
  const indent = paragraphIndent(pages);

  const blocks: { kind: "p" | "h" | "group"; text: string[]; prefix?: string; runs?: PdfRun[] }[] = [];
  let paragraph: PdfRun[] | null = null;
  let paragraphOpen = false;
  let group: { kind: Kind; lines: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph) {
      const text = styled(paragraph);
      if (text) blocks.push({ kind: "p", text: [text] });
    }
    paragraph = null;
    paragraphOpen = false;
  };
  const flushGroup = () => {
    if (group?.lines.length) blocks.push({ kind: "group", text: group.lines });
    group = null;
  };
  const addToGroup = (kind: Kind, line: string, gap: boolean) => {
    if (!group || group.kind !== kind || (gap && kind === "verse")) {
      flushGroup();
      group = { kind, lines: [] };
    }
    group.lines.push(line);
  };

  for (const page of pages) {
    const rows = classifyPage(page, body, lineGap, indent);
    rows.forEach((row, index) => {
      const firstOnPage = index === 0;
      if (row.kind !== "text") flushParagraph();
      if (row.kind !== "center" && row.kind !== "right" && row.kind !== "verse") flushGroup();

      switch (row.kind) {
        case "heading": {
          const text = styled(row.line.runs, { bold: false }).replace(/^#+\s*/, "");
          const last = blocks[blocks.length - 1];
          // Ikki qatorga bo'lingan sarlavha — bitta.
          if (last?.kind === "h" && !row.gap && !firstOnPage) last.text[0] += ` ${text}`;
          else blocks.push({ kind: "h", text: [text], prefix: row.level === 1 ? "#" : "##" });
          return;
        }
        case "center":
          addToGroup("center", `-> ${styled(row.line.runs)} <-`, row.gap);
          return;
        case "right":
          addToGroup("right", `-> ${styled(row.line.runs)}`, row.gap);
          return;
        case "verse":
          addToGroup("verse", `> ${styled(row.line.runs, { italic: false })}`, row.gap);
          return;
        default: {
          // Lug'atdagidek qalin so'z bilan boshlangan qator, oldingi gap tugagan bo'lsa — yangi xatboshi.
          const boldLead = Boolean(row.line.runs[0]?.bold) && /[.!?»:;)]$/.test(paragraph ? paragraph.map((r) => r.text).join("").trim() : "");
          const startsNew = !paragraph || !paragraphOpen || row.indented || boldLead || (row.gap && !firstOnPage);
          if (startsNew) {
            flushParagraph();
            paragraph = row.line.runs.map((r) => ({ ...r }));
          } else {
            const target = paragraph!;
            const last = target[target.length - 1];
            const next = row.line.runs.map((r) => ({ ...r }));
            // Qator oxiridagi chiziqcha: bo'g'in ko'chirishmi («kitob-lar») yoki qo'shma so'zmi («ota-ona») —
            // oxirida butun matn lug'ati bo'yicha hal qilinadi (HYPHEN belgisi).
            if (last && /\p{L}[-\u00AD]$/u.test(last.text) && /^\p{Ll}/u.test(next[0]?.text ?? "")) last.text = last.text.slice(0, -1) + (last.text.endsWith("\u00AD") ? "" : HYPHEN);
            else if (last) last.text += " ";
            target.push(...next);
          }
          paragraphOpen = !row.short;
        }
      }
    });
  }
  flushParagraph();
  flushGroup();

  const markup = blocks
    .map((b) => (b.kind === "h" ? `${b.prefix} ${b.text[0]}` : b.text.join("\n")))
    .filter((text) => text.replace(/[#>\-<\s*]/g, ""))
    .join("\n\n");
  return resolveHyphens(markup);
}

/** Qator oxirida bo'lingan so'z belgisi (matnda uchramaydigan xususiy belgi). */
const HYPHEN = "\uE000";

/**
 * «ota-|onalar» → matnning boshqa joyida «otaonalar» bor-u «ota-onalar» yo'q bo'lsa — bo'g'in ko'chirish,
 * chiziqcha olib tashlanadi; aks holda qo'shma so'z deb saqlanadi.
 */
function resolveHyphens(markup: string): string {
  if (!markup.includes(HYPHEN)) return markup;
  const words = new Set(markup.replace(new RegExp(`\\p{L}+${HYPHEN}\\p{L}+`, "gu"), " ").toLocaleLowerCase().match(/[\p{L}'’‘-]+/gu) ?? []);
  return markup.replace(new RegExp(`(\\p{L}+)${HYPHEN}(\\p{L}+)`, "gu"), (_, left: string, right: string) => {
    const joined = `${left}${right}`.toLocaleLowerCase();
    const hyphened = `${left}-${right}`.toLocaleLowerCase();
    return words.has(joined) && !words.has(hyphened) ? `${left}${right}` : `${left}-${right}`;
  });
}

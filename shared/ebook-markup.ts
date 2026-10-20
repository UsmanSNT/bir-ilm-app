/**
 * Elektron kitob matni: oddiy, qo'lda yozish oson belgilash. Server (tanishuv qismini kesish) ham, o'qish
 * oynasi (sahifalash) ham shu tahlilchidan foydalanadi. Tashqi importsiz — `node --experimental-strip-types`
 * bilan sinovdan o'tadi.
 *
 *   # Bob sarlavhasi          — mundarijaga kiradi, yangi sahifadan boshlanadi
 *   ## Bo'lim sarlavhasi      — mundarijaga kiradi
 *   ### Kichik sarlavha       — mundarijaga kirmaydi (masalan, lug'atdagi harflar)
 *   Oddiy qator               — xatboshi (har bir qator alohida xatboshi)
 *   > she'r qatori            — she'r; ketma-ket ">" qatorlar bitta band, bo'sh qator bandni yopadi
 *   -> o'rtadagi matn <-      — o'rtada
 *   -> imzo                   — o'ngda
 *   ---                       — yangi sahifa
 *   **qalin**, *kursiv*, ***ikkalasi***; \* — oddiy yulduzcha
 *
 * Apostroflar ko'rsatishda o'zi to'g'rilanadi: o' g' → o‘ g‘, qolgan tutuq belgisi → ’.
 */

export type EbookRun = { text: string; bold?: true; italic?: true };
export type EbookLine = EbookRun[];

export type EbookBlock =
  | { kind: "h1" | "h2" | "h3"; runs: EbookLine; text: string }
  | { kind: "p"; runs: EbookLine }
  | { kind: "verse" | "center" | "right"; lines: EbookLine[] }
  | { kind: "break" };

type LineKind = "h1" | "h2" | "h3" | "p" | "verse" | "center" | "right" | "break" | "blank";
type ClassifiedLine = { kind: LineKind; text: string };

const BREAK = /^-{3,}$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const CENTER = /^->\s*(.*?)\s*<-$/;
const RIGHT = /^->\s*(.*)$/;
const VERSE = /^>(?!>)\s?(.*)$/;

function classify(raw: string): ClassifiedLine {
  const line = raw.trim();
  if (!line) return { kind: "blank", text: "" };
  if (BREAK.test(line)) return { kind: "break", text: "" };
  let m = HEADING.exec(line);
  if (m) return { kind: m[1].length === 1 ? "h1" : m[1].length === 2 ? "h2" : "h3", text: m[2].trim() };
  m = CENTER.exec(line);
  if (m) return { kind: "center", text: m[1] };
  m = RIGHT.exec(line);
  if (m) return { kind: "right", text: m[1] };
  m = VERSE.exec(line);
  // Bo'sh ">" — band oralig'i.
  if (m) return m[1].trim() ? { kind: "verse", text: m[1].trim() } : { kind: "blank", text: "" };
  return { kind: "p", text: line };
}

const GROUPED = new Set<LineKind>(["verse", "center", "right"]);

/** Matnni bloklarga ajratadi. Bo'sh qatorlar faqat she'r/o'rta/o'ng guruhlarini ajratadi. */
export function parseEbook(source: string): EbookBlock[] {
  const blocks: EbookBlock[] = [];
  let group: { kind: "verse" | "center" | "right"; lines: EbookLine[] } | null = null;
  for (const raw of source.split("\n")) {
    const line = classify(raw);
    if (group && line.kind !== group.kind) group = null;
    switch (line.kind) {
      case "blank":
        break;
      case "break":
        blocks.push({ kind: "break" });
        break;
      case "h1":
      case "h2":
      case "h3": {
        const runs = parseInline(line.text);
        if (runs.length) blocks.push({ kind: line.kind, runs, text: runsText(runs) });
        break;
      }
      case "p": {
        const runs = parseInline(line.text);
        if (runs.length) blocks.push({ kind: "p", runs });
        break;
      }
      default: {
        const kind = line.kind as "verse" | "center" | "right";
        if (!group) {
          group = { kind, lines: [] };
          blocks.push(group);
        }
        group.lines.push(parseInline(line.text));
      }
    }
  }
  return blocks;
}

const INLINE_TOKEN = /(\\[*\\]|\*{1,3})/;

/** `**qalin**`, `*kursiv*`, `***ikkalasi***`. Yopilmagan belgi bo'lsa qator oddiy matn sifatida qoladi. */
export function parseInline(text: string): EbookLine {
  const runs: EbookLine = [];
  let bold = false;
  let italic = false;
  for (const token of text.split(INLINE_TOKEN)) {
    if (!token) continue;
    if (token === "***") {
      bold = !bold;
      italic = !italic;
    } else if (token === "**") bold = !bold;
    else if (token === "*") italic = !italic;
    else pushRun(runs, token.startsWith("\\") && token.length === 2 ? token[1] : token, bold, italic);
  }
  if (bold || italic) {
    const literal = typography(text.replace(/\\([*\\])/g, "$1"));
    return literal.trim() ? [{ text: literal }] : [];
  }
  return runs;
}

function pushRun(runs: EbookLine, raw: string, bold: boolean, italic: boolean) {
  const text = typography(raw);
  const last = runs[runs.length - 1];
  if (last && !!last.bold === bold && !!last.italic === italic) {
    last.text += text;
    return;
  }
  runs.push({ text, ...(bold ? { bold: true as const } : {}), ...(italic ? { italic: true as const } : {}) });
}

/** O'zbek lotin yozuvi apostroflari: o' g' → o‘ g‘; harfdan keyingi qolgan ' → ’ (tutuq belgisi). */
export function typography(text: string): string {
  return text.replace(/([OoGg])['`ʻ‘’]/g, "$1‘").replace(/(\p{L})['`ʼ]/gu, "$1’");
}

export function runsText(runs: EbookLine): string {
  return runs.map((r) => r.text).join("");
}

/**
 * Saqlashdan oldin tozalash: BOM, \r, boshqaruv belgilari, qator oxiridagi bo'shliqlar, ketma-ket
 * ko'p bo'sh qatorlar.
 */
export function tidyEbookSource(source: string): string {
  return source
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Belgilarsiz o'qiladigan matn uzunligi (taxminiy o'qish hajmi). */
function lineLength(line: ClassifiedLine): number {
  return line.text.replace(/\\?\*+/g, "").length;
}

export function ebookTextLength(source: string): number {
  return source.split("\n").reduce((sum, raw) => sum + lineLength(classify(raw)), 0);
}

export type PreviewRule = {
  /** Matnning qancha qismi (0..1). */
  share: number;
  /** Kitob kichik bo'lsa ham kamida shuncha belgi. */
  minChars: number;
  /** Hech qachon bundan ko'p emas (0..1). */
  maxShare: number;
};

/**
 * Tanishuv qismi: matn boshidan `share` ulushi (kamida `minChars`, ko'pi bilan `maxShare`). Xatboshi,
 * she'r bandi yoki o'rta/o'ng guruh o'rtasida kesilmaydi; oxirida yolg'iz sarlavha qolmaydi.
 */
export function ebookPreview(source: string, rule: PreviewRule): string {
  const lines = source.split("\n");
  const classified = lines.map(classify);
  const total = classified.reduce((sum, line) => sum + lineLength(line), 0);
  const target = Math.min(Math.max(rule.minChars, total * rule.share), total * rule.maxShare);

  let taken = 0;
  let end = 0;
  while (end < lines.length && taken < target) taken += lineLength(classified[end++]);
  // Guruh oxirigacha (she'r bandi bo'linmasin).
  const last = classified[end - 1];
  if (last && GROUPED.has(last.kind)) while (end < lines.length && classified[end].kind === last.kind) end++;
  // Oxirida sarlavha, sahifa uzilishi yoki bo'sh qator qolmasin.
  while (end > 0 && ["h1", "h2", "h3", "break", "blank"].includes(classified[end - 1].kind)) end--;
  return lines.slice(0, end).join("\n");
}

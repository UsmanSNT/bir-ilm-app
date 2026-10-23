/** E-kitob belgilashi va PDF qatorlaridan matn tiklash. `node --experimental-strip-types` bilan ishlaydi. */
import assert from "node:assert/strict";
import { ebookPreview, ebookTextLength, markRuns, parseEbook, parseInline, tidyEbookSource, typography } from "../shared/ebook-markup.ts";
import { itemsToLines, pagesToMarkup } from "../lib/pdf-layout.ts";

// ── Tipografiya ─────────────────────────────────────────────────────
assert.equal(typography("O'zbek tili go'zal, ta'lim, Qur'on, ulug'"), "O‘zbek tili go‘zal, ta’lim, Qur’on, ulug‘");
assert.equal(typography("G'AZAB — oʻgʻil"), "G‘AZAB — o‘g‘il");

// ── Inline ──────────────────────────────────────────────────────────
assert.deepEqual(parseInline("a **b** *c* ***d***"), [
  { text: "a " }, { text: "b", bold: true }, { text: " " }, { text: "c", italic: true }, { text: " " }, { text: "d", bold: true, italic: true },
]);
assert.deepEqual(parseInline("2 * 3 = 6"), [{ text: "2 * 3 = 6" }], "Yopilmagan yulduzcha — oddiy matn");
assert.deepEqual(parseInline("\\*izoh\\*"), [{ text: "*izoh*" }]);
assert.deepEqual(parseInline("<b>x</b>"), [{ text: "<b>x</b>" }], "HTML matn sifatida qoladi");

// ── Bloklar ─────────────────────────────────────────────────────────
const source = tidyEbookSource([
  "﻿# 1-BOB  ",
  "## Bo'lim",
  "### A",
  "Birinchi xatboshi.",
  "Ikkinchi xatboshi.",
  "",
  "> Birinchi misra,",
  "> ikkinchi misra.",
  ">",
  "> Ikkinchi band.",
  "-> **BAYT** <-",
  "-> *Imzo*",
  "---",
  "Oxiri.\r",
].join("\n"));
const blocks = parseEbook(source);
assert.deepEqual(blocks.map((b) => b.kind), ["h1", "h2", "h3", "p", "p", "verse", "verse", "center", "right", "break", "p"]);
assert.equal(blocks[1].text, "Bo‘lim");
assert.equal(blocks[5].lines.length, 2, "Bo'sh '>' bandni ajratadi");
assert.deepEqual(blocks[7].lines[0], [{ text: "BAYT", bold: true }]);
assert.equal(ebookTextLength("# Sarlavha\n**qalin** so'z"), "Sarlavha".length + "qalin so'z".length);

// ── Tanishuv qismi ──────────────────────────────────────────────────
const long = ["# BOB", ...Array.from({ length: 50 }, (_, i) => `${i}. ${"so'z ".repeat(40)}`), "## Keyingi", "> a", "> b", "> c"].join("\n");
const rule = { share: 0.1, minChars: 500, maxShare: 0.5 };
const cut = ebookPreview(long, rule);
assert.ok(long.startsWith(cut));
assert.ok(ebookTextLength(cut) >= 0.1 * ebookTextLength(long));
assert.ok(ebookTextLength(cut) < 0.2 * ebookTextLength(long));
// Chegara ikkinchi misraga to'g'ri keladi — band oxirigacha olinadi.
const verse = (n) => `> ${n}-misra ${"m".repeat(22)}`;
const verseCut = ebookPreview(["# B", "x".repeat(400), verse(1), verse(2), verse(3), "y".repeat(2000)].join("\n"), { share: 0.18, minChars: 0, maxShare: 1 });
assert.ok(verseCut.endsWith(verse(3)), "She'r bandi o'rtasida kesilmaydi");
assert.ok(!ebookPreview(["x".repeat(100), "## Sarlavha", "y".repeat(900)].join("\n"), { share: 0.105, minChars: 0, maxShare: 1 }).includes("Sarlavha"), "Oxirida yolg'iz sarlavha qolmaydi");
// Belgilangan oraliqlar: bo'laklar uslubni saqlaydi, ustma-ust tushgan oraliqlar bitta belgilanadi.
const runs = [{ text: "Ilm nurdur", bold: true }, { text: " va yomon", italic: true }];
const marked = markRuns(runs, [{ start: 4, end: 9 }, { start: 6, end: 11 }]);
assert.equal(marked.map((r) => r.text).join(""), "Ilm nurdur va yomon", "Matn o'zgarmaydi");
assert.equal(marked.filter((r) => r.hl).map((r) => r.text).join(""), "nurdur ", "Belgilangan qism: 4..11");
assert.equal(marked[0].text, "Ilm ");
assert.ok(!marked[0].hl && marked[0].bold, "Belgilanmagan bo'lak uslubini saqlaydi");
assert.ok(marked.filter((r) => r.hl && r.text.trim()).every((r) => r.bold || r.italic), "Belgilangan bo'lak o'z uslubini saqlaydi");
assert.ok(marked.filter((r) => r.hl && r.bold).length >= 3, "Qalin qism belgilanganda qalinligicha qoladi");
const colored = markRuns([{ text: "abcdefgh" }], [{ start: 0, end: 6, color: "anor" }, { start: 2, end: 4, color: "yashil" }]);
assert.deepEqual(colored.map((r) => [r.text, r.hl]), [["ab", "anor"], ["cd", "yashil"], ["ef", "anor"], ["gh", undefined]], "Rang belgilangan oraliq bo'yicha; ustma-ust tushganda oxirgisi ustun");
assert.ok(marked.filter((r) => r.text.includes("va")).every((r) => r.italic && !r.hl), "Kursiv, belgilanmagan qism");
assert.equal(markRuns(runs, []), runs, "Oraliq bo'lmasa — o'zgarmaydi");

console.log("PASS: Belgilash: sarlavha, xatboshi, she'r bandlari, o'rta/o'ng, apostroflar, tanishuv qismi.");

// ── PDF qatorlari → belgilash ───────────────────────────────────────
const item = (text, x, y, opts = {}) => ({ text, x, y, width: opts.width ?? text.length * 5.5, size: opts.size ?? 11, bold: Boolean(opts.bold), italic: Boolean(opts.italic) });
const L = 60;
const R = 535;
const full = (text, x, y) => item(text, x, y, { width: R - x });
const page = (items) => ({ width: 595, lines: itemsToLines(items) });
const pages = [
  page([
    item("BIRINCHI BOB", 240, 80, { size: 16, bold: true, width: 115 }),
    full("Bu kitobning birinchi xatboshisi shu yerda boshlanadi va keyingi", L + 30, 120),
    full("qatorga o'tadi, so'ng yana davom etib, bo'g'in ko'chi-", L, 134),
    item("rilgan so'z bilan tugaydi.", L, 148, { width: 140 }),
    full("Ikkinchi xatboshi chekinish bilan boshlanadi va uzun davom etadi", L + 30, 162),
    item("qisqa tugaydi.", L, 176, { width: 80 }),
    item("Birinchi misra, she'r qatori,", L + 40, 205, { italic: true, width: 160 }),
    item("Ikkinchi misra kursivda.", L + 40, 219, { italic: true, width: 140 }),
    item("Muallif", 480, 245, { italic: true, width: 55 }),
    item("— 1 —", 285, 800, { width: 25 }),
  ]),
  page([
    full("Davomi oldingi sahifadan kelmaydi, chunki chekingan qator yangi", L + 30, 80),
    item("xatboshi.", L, 94, { width: 50 }),
    item("Muhim", L, 108, { bold: true, width: 35 }),
    item(" so'z qalin.", L + 35, 108, { width: 60 }),
    item("— 2 —", 285, 800, { width: 25 }),
  ]),
];
const markup = pagesToMarkup(pages);
assert.equal(markup, [
  "# BIRINCHI BOB",
  // «ko'chirilgan» matnning boshqa joyida yo'q — chiziqcha saqlanadi (muharrirda tuzatiladi).
  "Bu kitobning birinchi xatboshisi shu yerda boshlanadi va keyingi qatorga o'tadi, so'ng yana davom etib, bo'g'in ko'chi-rilgan so'z bilan tugaydi.",
  "Ikkinchi xatboshi chekinish bilan boshlanadi va uzun davom etadi qisqa tugaydi.",
  "> Birinchi misra, she'r qatori,\n> Ikkinchi misra kursivda.",
  "-> *Muallif*",
  "Davomi oldingi sahifadan kelmaydi, chunki chekingan qator yangi xatboshi.",
  "**Muhim** so'z qalin.",
].join("\n\n"));
assert.deepEqual(parseEbook(markup).map((b) => b.kind), ["h1", "p", "p", "verse", "right", "p", "p"]);
// Qator oxiridagi chiziqcha: matnda «kitoblar» bor — bo'g'in ko'chirish; «ota-ona» bor — qo'shma so'z.
const hyphenPage = page([
  full("Birinchi xatboshida yaxshi kitoblar va ota-ona haqida gap bor, keyin kitob-", L + 30, 80),
  item("lar haqida.", L, 94, { width: 60 }),
  full("Ikkinchi xatboshida esa bolalar o'z ota-onasini hurmat qilib, ota-", L + 30, 108),
  item("onalari bilan yurishadi.", L, 122, { width: 120 }),
]);
assert.equal(pagesToMarkup([hyphenPage]), [
  "Birinchi xatboshida yaxshi kitoblar va ota-ona haqida gap bor, keyin kitoblar haqida.",
  "Ikkinchi xatboshida esa bolalar o'z ota-onasini hurmat qilib, ota-onalari bilan yurishadi.",
].join("\n\n"));
console.log("PASS: PDF: sarlavha, xatboshi chegaralari, bo'g'in ko'chirish va qo'shma so'z, kursiv she'r, imzo, sahifa raqamlari, qalin so'z.");

console.log("\nHAMMASI O'TDI: e-kitob belgilashi.");

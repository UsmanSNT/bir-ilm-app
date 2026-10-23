/** Markdown belgilarini tanish va tozalash (ChatGPT'dan ko'chirilgan matn). `node --experimental-strip-types` bilan ishlaydi. */
import assert from "node:assert/strict";
import { looksLikeMarkdown, markdownToHtml, normalizeBullets, stripMarkdown } from "../lib/markdown.ts";

const sample = "## Pul psixologiyasi — Morgan Housel\nBu kitob pul haqida. Asosiy g'oyalar: - **Pul bilan munosabat:** Hissiyotlar ta'sir qiladi. - **Boylik:** Ko'p pul boylik emas.";

assert.equal(looksLikeMarkdown(sample), true);
assert.equal(looksLikeMarkdown("Oddiy matn, hech qanday belgisiz."), false);
assert.equal(looksLikeMarkdown("2 * 3 = 6 va 5 - 2 = 3"), false, "Arifmetika markdown emas");
assert.equal(looksLikeMarkdown("- bir\n- ikki"), true);
assert.equal(looksLikeMarkdown("**qalin**"), true);

const plain = stripMarkdown(sample);
assert.ok(!/##|\*\*/.test(plain), plain);
assert.match(plain, /^Pul psixologiyasi — Morgan Housel\n/);
assert.match(plain, /• Pul bilan munosabat: Hissiyotlar/);
assert.equal(plain.split("\n").filter((l) => l.startsWith("• ")).length, 2, "Yopishgan bandlar alohida qatorga ajraladi");

assert.equal(normalizeBullets("a - **b:** x - **c:** y"), "a\n- **b:** x\n- **c:** y");

const html = markdownToHtml(sample);
assert.match(html, /^<h2>Pul psixologiyasi — Morgan Housel<\/h2>/);
assert.match(html, /<ul><li><strong>Pul bilan munosabat:<\/strong> Hissiyotlar ta'sir qiladi\.<\/li><li><strong>Boylik:<\/strong>/);
assert.equal(markdownToHtml("### Kichik\n*kursiv* va **qalin**"), "<h3>Kichik</h3><p><em>kursiv</em> va <strong>qalin</strong></p>");
assert.equal(markdownToHtml("1. bir\n2. ikki"), "<ol><li>bir</li><li>ikki</li></ol>");
assert.equal(markdownToHtml("> iqtibos"), "<blockquote><p>iqtibos</p></blockquote>");
assert.equal(markdownToHtml("`kod` va ~~o'chgan~~"), "<p>kod va o'chgan</p>");
// XSS: HTML belgilari kodlanadi
assert.equal(markdownToHtml("<img src=x onerror=alert(1)> **b**"), "<p>&lt;img src=x onerror=alert(1)&gt; <strong>b</strong></p>");
assert.equal(markdownToHtml("Birinchi\nIkkinchi qator\n\nYangi abzats"), "<p>Birinchi<br>Ikkinchi qator</p><p>Yangi abzats</p>");

console.log("PASS: markdown: tanish, tozalash, HTMLga o'tkazish, XSS kodlanadi.");

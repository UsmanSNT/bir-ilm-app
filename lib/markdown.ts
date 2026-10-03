/**
 * Boshqa joydan (ChatGPT, Telegram, hujjat) ko'chirilgan matndagi markdown belgilari (`##`, `**`, `- `) bilan ishlash.
 * HTML tayyorlanadi, lekin u to'g'ridan-to'g'ri DOM'ga qo'yilmaydi: muharrir uni `domToDoc` orqali o'tkazadi.
 */

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Bir qatorga yopishib qolgan « - **Sarlavha:** …» bandlari va «… ## Sarlavha» ni alohida qatorlarga ajratadi. */
export function normalizeBullets(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+(?:[-*•])\s+(?=\*\*)/g, "\n- ")
    .replace(/([^\n#])[ \t]+(#{2,6}[ \t])/g, "$1\n$2");
}

/** Matnda markdown bormi: sarlavha (`## `), qalin (`**x**`) yoki kamida ikki band (`- `, `1. `). */
export function looksLikeMarkdown(text: string): boolean {
  if (/(^|\n)[ \t]{0,3}#{1,6}[ \t]+\S/.test(text)) return true;
  if (/\*\*[^*\n]+\*\*/.test(text) || /__[^_\n]+__/.test(text)) return true;
  return (text.match(/(^|\n)[ \t]*(?:[-*•]|\d+[.)])[ \t]+\S/g) ?? []).length >= 2;
}

/** Belgilarni olib tashlab, oddiy matn qaytaradi (bandlar `• ` bo'lib qoladi). */
export function stripMarkdown(text: string): string {
  return normalizeBullets(text)
    .replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/^[ \t]*[-*][ \t]+/gm, "• ")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "<strong>$2</strong>")
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\w])/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_(?=\S)([^_\n]+?)(?<=\S)_(?![_\w])/g, "$1<em>$2</em>")
    .replace(/~~(.+?)~~/g, "$1");
}

/** Markdown → oddiy HTML (sarlavha, abzats, ro'yxat, iqtibos, qalin, kursiv). Muharrir uni yana tozalaydi. */
export function markdownToHtml(text: string): string {
  const lines = normalizeBullets(text).split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; };
  const flushList = () => {
    if (list) out.push(`<${list.ordered ? "ol" : "ul"}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.ordered ? "ol" : "ul"}>`);
    list = null;
  };
  const flushQuote = () => { if (quote.length) out.push(`<blockquote><p>${quote.map(inline).join("<br>")}</p></blockquote>`); quote = []; };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushAll(); continue; }
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) { flushAll(); continue; }
    const heading = /^(#{1,6})[ \t]*(.+)$/.exec(line);
    if (heading) { flushAll(); const tag = heading[1].length <= 2 ? "h2" : "h3"; out.push(`<${tag}>${inline(heading[2].replace(/\s*#+\s*$/, ""))}</${tag}>`); continue; }
    const bullet = /^([-*•])\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      flushPara(); flushQuote();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ? bullet[2] : numbered![1]).trim());
      continue;
    }
    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) { flushPara(); flushList(); quote.push(quoted[1]); continue; }
    flushList(); flushQuote();
    para.push(line);
  }
  flushAll();
  return out.join("");
}

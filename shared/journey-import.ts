/**
 * «Bir Ilm yo'li» kitoblari ro'yxatini matndan o'qish (admin ro'yxatni bir yo'la joylaganda).
 *
 * Har qator: raqam yoki sana, so'ng kitob nomi va (ixtiyoriy) muallif. Masalan:
 *   247. Barkamol farzand tarbiyasi — Abdulla Avloniy
 *   2026-10-17 | Atom odatlar | Jeyms Klir
 *   17.10.2026  «Alkimyogar»
 *   246-kitob: Kichik shahzoda
 * Mijoz oldindan ko'rsatish uchun, server esa xuddi shu qoidalar bilan tekshirilgan qatorlarni qabul qiladi.
 */
import { JOURNEY_LIMITS, journeyNumberInRange, sessionNumberOf, type Anchor } from "./journey";

export type JourneyListRow = { number: number; title: string; author: string };
export type JourneyListIssue = { line: number; text: string; reason: string };
export type JourneyListResult = {
  /** Raqam bo'yicha tartiblangan; bir raqam takrorlansa, oxirgi qator qoladi. */
  rows: JourneyListRow[];
  issues: JourneyListIssue[];
  /** Raqami takrorlanib, oldingisi o'rniga yozilgan qatorlar soni. */
  duplicates: number;
};

// Sana raqamdan oldin tekshiriladi: «2026-10-17» ni «2026» raqami deb o'qimaslik uchun.
const LEAD_ISO = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/;
const LEAD_DMY = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/;
const LEAD_NUMBER = /^(\d{1,4})(?!\d)(?:\s*-?\s*kitob)?/i;
/** Boshidagi raqam/sanadan keyingi ajratgichlar. */
const LEAD_GAP = /^[\s.)\]:|,–—-]+/;
/** Muallifni ajratadigan belgilar, ustuvorlik tartibida. */
const AUTHOR_SEPARATORS = ["\t", "|", " — ", " – ", " - "] as const;

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

/** «Nom» yoki "Nom" — o'rab turgan qo'shtirnoqlar olib tashlanadi (ichki apostroflarga tegilmaydi). */
function unquote(text: string): string {
  const pairs: Record<string, string> = { "«": "»", '"': '"', "“": "”", "„": "“" };
  const close = pairs[text[0]];
  return close && text.length > 1 && text.endsWith(close) ? text.slice(1, -1).trim() : text;
}

function splitAuthor(rest: string): [string, string] {
  for (const separator of AUTHOR_SEPARATORS) {
    const at = rest.indexOf(separator);
    if (at > 0) return [rest.slice(0, at), rest.slice(at + separator.length)];
  }
  return [rest, ""];
}

const pad = (value: string) => value.padStart(2, "0");

export function parseJourneyList(text: string, anchor: Anchor): JourneyListResult {
  const byNumber = new Map<number, JourneyListRow>();
  const issues: JourneyListIssue[] = [];
  let duplicates = 0;

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const source = raw.trim();
    if (!source || source.startsWith("#") || source.startsWith("//")) return;
    const bad = (reason: string) => issues.push({ line, text: source.slice(0, 80), reason });

    let number: number | null;
    let rest: string;
    const iso = LEAD_ISO.exec(source);
    const dmy = iso ? null : LEAD_DMY.exec(source);
    const plain = iso || dmy ? null : LEAD_NUMBER.exec(source);
    if (iso || dmy) {
      const lead = (iso ?? dmy)!;
      const date = iso ? `${lead[1]}-${lead[2]}-${lead[3]}` : `${lead[3]}-${pad(lead[2])}-${pad(lead[1])}`;
      number = sessionNumberOf(anchor, date);
      if (number === null) return bad("Sana shanba emas yoki noto‘g‘ri");
      if (number < 1) return bad("Sana yo‘l boshlanishidan oldin");
      rest = source.slice(lead[0].length);
    } else if (plain) {
      number = Number(plain[1]);
      rest = source.slice(plain[0].length);
    } else {
      return bad("Qator raqam yoki sana bilan boshlansin");
    }
    if (!journeyNumberInRange(anchor, number)) return bad(`Raqam 1 dan ${anchor.number + JOURNEY_LIMITS.weeksAhead} gacha bo‘lsin`);

    const gap = LEAD_GAP.exec(rest);
    if (!gap && rest.trim()) return bad("Raqamdan keyin nuqta, tire yoki bo‘shliq qo‘ying");
    const [rawTitle, rawAuthor] = splitAuthor(rest.slice(gap?.[0].length ?? 0));
    const title = unquote(tidy(rawTitle));
    const author = tidy(rawAuthor);
    if (!title) return bad("Kitob nomi yo‘q");
    if (title.length > JOURNEY_LIMITS.title) return bad(`Nom ${JOURNEY_LIMITS.title} belgidan oshmasin`);
    if (author.length > JOURNEY_LIMITS.author) return bad(`Muallif ${JOURNEY_LIMITS.author} belgidan oshmasin`);

    if (byNumber.has(number)) duplicates += 1;
    byNumber.set(number, { number, title, author });
  });

  return { rows: [...byNumber.values()].sort((a, b) => a.number - b.number), issues, duplicates };
}

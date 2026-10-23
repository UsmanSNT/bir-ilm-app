// Haftalik muhokama jadvali va "Bir Ilm yo'li" hisoblari.
// Barcha vaqtlar UTC millisekundlarda. Toshkent (UTC+5) va Seul (UTC+9) yozgi vaqtga o'tmaydi,
// shuning uchun sobit siljish aniq natija beradi.

export const SESSION = {
  /** Shanba 18:00 Toshkent = 13:00 UTC = 22:00 Seul. */
  utcHour: 13,
  /** Jonli holatni ko'rsatish uchun taxminiy davomiylik. */
  durationMinutes: 120,
  uzTime: "18:00",
  korTime: "22:00",
} as const;

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const TASHKENT_OFFSET = 5 * 3_600_000;
const SATURDAY = 6;

export type Anchor = {
  /** Ma'lum bir muhokamaning tartib raqami. */
  number: number;
  /** Shu muhokama sanasi, YYYY-MM-DD (shanba). */
  date: string;
};

export type CellState = "before" | "done" | "live" | "next" | "future";

export type ShelfCell = { n: number | null; at: number; state: CellState };

export type ShelfYear = { year: number; cells: ShelfCell[]; held: number; planned: number };

/** Bir yillik pog'ona: shu yili qo'shilgani, shu yil oxirigacha jami, erishilgan yubileylar va o'sish bosqichi (0–4). */
export type GrowthYear = { year: number; held: number; planned: number; total: number; marks: number[]; stage: number };

/** Keyingi yubiley (har 50-kitob): qancha qoldi va oraliqning qancha qismi bosib o'tildi (0–1). */
export type Jubilee = { n: number; at: number; left: number; progress: number };

/** Yubiley qadami: har 50-kitob. */
export const JUBILEE_STEP = 50;

export type Journey = {
  start: number;
  completed: number;
  live: number | null;
  next: { n: number; at: number };
  elapsed: { years: number; months: number; days: number; totalDays: number };
  perYear: number;
  shelf: ShelfYear[];
  growth: GrowthYear[];
  jubilee: Jubilee;
};

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD ni o'sha kungi 18:00 Toshkent vaqtiga aylantiradi; noto'g'ri yoki shanba bo'lmasa null. */
export function saturdaySessionAt(date: string): number | null {
  const match = DATE_PATTERN.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const at = Date.UTC(year, month, day, SESSION.utcHour);
  const check = new Date(at);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== day) return null;
  return check.getUTCDay() === SATURDAY ? at : null;
}

export function isValidAnchor(anchor: Anchor): boolean {
  return Number.isInteger(anchor.number) && anchor.number >= 1 && anchor.number <= 10_000 && saturdaySessionAt(anchor.date) !== null;
}

function firstSessionAt(anchor: Anchor): number {
  const at = saturdaySessionAt(anchor.date);
  if (at === null) throw new Error("Anchor sanasi shanba bo'lishi kerak.");
  return at - (anchor.number - 1) * WEEK;
}

/** Berilgan vaqtdan keyin boshlanadigan eng yaqin muhokama vaqti. */
export function nextSessionAfter(now: number): number {
  const reference = Date.UTC(2026, 9, 24, SESSION.utcHour);
  const passed = Math.floor((now - reference) / WEEK) + 1;
  return reference + passed * WEEK;
}

/** Toshkent bo'yicha kalendar sanasi qismlari. */
export function tashkentParts(at: number) {
  const date = new Date(at + TASHKENT_OFFSET);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

function calendarDiff(from: number, to: number) {
  const a = tashkentParts(from);
  const b = tashkentParts(to);
  let years = b.year - a.year;
  let months = b.month - a.month;
  let days = b.day - a.day;
  if (days < 0) {
    months -= 1;
    days += new Date(Date.UTC(b.year, b.month, 0)).getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalDays = Math.round((Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) / DAY);
  return { years: Math.max(0, years), months: Math.max(0, months), days: Math.max(0, days), totalDays: Math.max(0, totalDays) };
}

export function computeJourney(anchor: Anchor, now: number): Journey {
  const start = firstSessionAt(anchor);
  const duration = SESSION.durationMinutes * 60_000;
  const sessionAt = (n: number) => start + (n - 1) * WEEK;

  const lastStarted = now >= start ? Math.floor((now - start) / WEEK) + 1 : 0;
  const live = lastStarted > 0 && now < sessionAt(lastStarted) + duration ? lastStarted : null;
  const completed = live === null ? lastStarted : lastStarted - 1;
  const next = { n: lastStarted + 1, at: sessionAt(lastStarted + 1) };

  const stateOf = (n: number): Exclude<CellState, "before"> =>
    n <= completed ? "done" : n === live ? "live" : n === next.n ? "next" : "future";

  const firstYear = new Date(start).getUTCFullYear();
  const lastYear = Math.max(firstYear, new Date(now).getUTCFullYear());
  const shelf: ShelfYear[] = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    const jan1 = Date.UTC(year, 0, 1, SESSION.utcHour);
    let at = jan1 + ((SATURDAY - new Date(jan1).getUTCDay() + 7) % 7) * DAY;
    const cells: ShelfCell[] = [];
    let held = 0;
    let planned = 0;
    for (; new Date(at).getUTCFullYear() === year; at += WEEK) {
      if (at < start) {
        cells.push({ n: null, at, state: "before" });
        continue;
      }
      const n = Math.round((at - start) / WEEK) + 1;
      const state = stateOf(n);
      if (state === "done") held += 1;
      else planned += 1;
      cells.push({ n, at, state });
    }
    shelf.push({ year, cells, held, planned });
  }

  let running = 0;
  const lastIndex = shelf.length - 1;
  const growth = shelf.map((year, index): GrowthYear => {
    running += year.held;
    const marks = year.cells.flatMap((cell) => (cell.state === "done" && cell.n !== null && (cell.n === 1 || cell.n % JUBILEE_STEP === 0) ? [cell.n] : []));
    return { year: year.year, held: year.held, planned: year.planned, total: running, marks, stage: lastIndex > 0 ? Math.round((index / lastIndex) * 4) : 4 };
  });

  const target = (Math.floor(completed / JUBILEE_STEP) + 1) * JUBILEE_STEP;
  const jubilee: Jubilee = { n: target, at: sessionAt(target), left: target - completed, progress: (completed - (target - JUBILEE_STEP)) / JUBILEE_STEP };

  const elapsed = calendarDiff(start, Math.max(start, now));
  const yearsFloat = elapsed.totalDays / 365.2425;
  const perYear = yearsFloat >= 1 ? Math.round(completed / yearsFloat) : completed;

  return { start, completed, live, next, elapsed, perYear, shelf, growth, jubilee };
}

/** "4 yil 8 oy" kabi qisqa davomiylik. */
export function formatSpan(span: { years: number; months: number; days: number }): string {
  const parts = [];
  if (span.years) parts.push(`${span.years} yil`);
  if (span.months) parts.push(`${span.months} oy`);
  if (!parts.length) parts.push(`${span.days} kun`);
  return parts.join(" ");
}

/** Qolgan vaqt: "1 kun 4 soat", "3 soat 12 daqiqa", "12 daqiqa". */
export function formatCountdown(ms: number): string {
  const { days, hours, minutes } = splitCountdown(ms);
  if (days) return `${days} kun ${hours} soat`;
  if (hours) return `${hours} soat ${minutes} daqiqa`;
  return `${minutes} daqiqa`;
}

/** Qolgan vaqt bo'laklari; daqiqa yuqoriga yaxlitlanadi (0 ko'rsatib turib boshlanmagan bo'lmasin). */
export function splitCountdown(ms: number): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}

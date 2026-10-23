/** «Bir Ilm yo'li» hisoblari (sof funksiyalar). `node --experimental-strip-types tests/journey.mjs` */
import assert from "node:assert/strict";

const { computeJourney, formatSpan, formatCountdown, nextSessionAfter, saturdaySessionAt } = await import("../shared/journey.ts");
const { uzDateTashkent: formatUzDate } = await import("../app/uz-date.ts");

const anchor = { number: 248, date: "2026-10-24" };
const utc = (iso) => Date.parse(iso);

// Juma, 23-oktabr 2026: 247 ta o'tgan, ertaga 248-kitob.
{
  const j = computeJourney(anchor, utc("2026-10-23T12:00:00Z"));
  assert.equal(j.completed, 247);
  assert.equal(j.live, null);
  assert.equal(j.next.n, 248);
  assert.equal(j.next.at, utc("2026-10-24T13:00:00Z"));
  assert.equal(j.start, utc("2022-01-29T13:00:00Z"));
  assert.equal(formatUzDate(j.start), "29-yanvar, 2022");
  assert.deepEqual(j.shelf.map((y) => [y.year, y.held]), [[2022, 49], [2023, 52], [2024, 52], [2025, 52], [2026, 42]]);
  assert.equal(j.shelf.reduce((sum, y) => sum + y.held, 0), 247);
  assert.equal(j.shelf.at(-1).planned, 10, "2026: 24-okt .. 26-dek");
  assert.equal(j.shelf[0].cells.filter((c) => c.state === "before").length, 4, "2022: 1,8,15,22-yanvar");
  assert.deepEqual(j.elapsed, { years: 4, months: 8, days: 24, totalDays: 1728 });
  assert.equal(formatSpan(j.elapsed), "4 yil 8 oy");
  assert.equal(j.perYear, 52);
  assert.deepEqual(j.milestones.map((m) => [m.n, m.state]), [[1, "done"], [50, "done"], [100, "done"], [150, "done"], [200, "done"], [248, "next"], [250, "future"]]);
  for (const year of j.shelf) for (const cell of year.cells) assert.equal(new Date(cell.at).getUTCDay(), 6);
}

// Shanba 18:30 Toshkent: efirda.
{
  const j = computeJourney(anchor, utc("2026-10-24T13:30:00Z"));
  assert.equal(j.live, 248);
  assert.equal(j.completed, 247);
  assert.equal(j.next.n, 249);
  assert.equal(j.shelf.at(-1).cells.find((c) => c.n === 248).state, "live");
}

// Muhokama tugagach (taxminiy 2 soat).
{
  const j = computeJourney(anchor, utc("2026-10-24T15:00:00Z"));
  assert.equal(j.live, null);
  assert.equal(j.completed, 248);
  assert.equal(j.next.n, 249);
}

// Boshlanishdan oldin.
{
  const j = computeJourney(anchor, utc("2021-12-01T00:00:00Z"));
  assert.equal(j.completed, 0);
  assert.equal(j.next.n, 1);
}

assert.equal(nextSessionAfter(utc("2026-10-23T12:00:00Z")), utc("2026-10-24T13:00:00Z"));
assert.equal(nextSessionAfter(utc("2026-10-24T13:00:00Z")), utc("2026-10-31T13:00:00Z"));
assert.equal(nextSessionAfter(utc("2026-10-24T12:59:00Z")), utc("2026-10-24T13:00:00Z"));
assert.equal(saturdaySessionAt("2026-10-25"), null, "yakshanba rad etiladi");
assert.equal(saturdaySessionAt("2026-02-30"), null, "mavjud bo'lmagan sana");
assert.equal(formatCountdown(25 * 3_600_000 + 60_000), "1 kun 1 soat");
assert.equal(formatCountdown(90 * 60_000), "1 soat 30 daqiqa");

console.log("journey: barcha tekshiruvlar o'tdi");

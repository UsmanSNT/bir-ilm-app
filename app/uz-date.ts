/** O'zbekcha sana: brauzerlarning "uz-UZ" lokali bir xil emas (Chromium "M10" chiqaradi), shuning uchun qo'lda. */
export const uzDays = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
export const uzMonths = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

/** "Juma, 2-oktabr" */
export const uzDate = (d: Date) => `${uzDays[d.getDay()]}, ${d.getDate()}-${uzMonths[d.getMonth()]}`;

/** Toshkent vaqti (UTC+5, yozgi vaqt yo'q) bo'yicha "Yakshanba, 4-oktabr · 18:00". */
export function uzDateTimeTashkent(ms: number) {
  const t = new Date(ms + 5 * 3600_000);
  const hh = String(t.getUTCHours()).padStart(2, "0"), mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${uzDays[t.getUTCDay()]}, ${t.getUTCDate()}-${uzMonths[t.getUTCMonth()]} · ${hh}:${mm}`;
}

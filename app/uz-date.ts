/** O'zbekcha sana: brauzerlarning "uz-UZ" lokali bir xil emas (Chromium "M10" chiqaradi), shuning uchun qo'lda. */
export const uzDays = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
export const uzMonths = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

/** "Juma, 2-oktabr" */
export const uzDate = (d: Date) => `${uzDays[d.getDay()]}, ${d.getDate()}-${uzMonths[d.getMonth()]}`;

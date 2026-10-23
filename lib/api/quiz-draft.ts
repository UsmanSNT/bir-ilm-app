/**
 * Viktorina qoralamasi: saqlanmagan forma brauzerda (localStorage) vaqtincha turadi.
 * Admin sahifadan chiqib qaytsa, tuzish o'sha joydan davom etadi. Server bilan sinxronlanmaydi;
 * viktorina saqlanganda yoki qoralama tozalanganda o'chadi. Xotira yopiq bo'lsa, jim o'tkaziladi.
 */
const PREFIX = "bir-ilm-quiz-draft-v1:";

export type QuizDraftQuestion = { prompt: string; choices: string[]; answer: number };
export type QuizDraft = { title: string; bookId: string; image: string | null; questions: QuizDraftQuestion[] };

function isDraft(value: unknown): value is QuizDraft {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<QuizDraft>;
  return typeof v.title === "string" && typeof v.bookId === "string" && Array.isArray(v.questions);
}

export function readQuizDraft(key: string): QuizDraft | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeQuizDraft(key: string, draft: QuizDraft): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(draft));
  } catch {
    /* Xotira to'lgan yoki o'chirilgan: qoralama saqlanmaydi, forma ishlashda davom etadi. */
  }
}

export function clearQuizDraft(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

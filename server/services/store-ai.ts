/**
 * Book Store AI yordamchisi (Google Gemini).
 *
 * Kalit faqat serverda (`GEMINI_API_KEY`); mijozga hech qachon chiqmaydi.
 * Xarajatni cheklash: faqat ro'yxatdan o'tganlar va har foydalanuvchiga
 * vaqt oynasida cheklangan so'rov (server bitta Node jarayoni — xotiradagi hisob yetarli).
 */
import type { Database } from "@/server/db/client";
import { ApiException, notFound } from "@/server/http/errors";
import { requireSignedIn } from "./community";
import { catalogForAi } from "./store";
import type { StoreAiInput } from "@/shared/contract";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 20;
const hits = new Map<string, number[]>();

function takeQuota(userId: string, now = Date.now()): void {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    throw new ApiException("rate_limited", "AI'ga juda ko'p so'rov yuborildi. Birozdan keyin urinib ko'ring.", 429);
  }
  recent.push(now);
  hits.set(userId, recent);
  // Xotira cheksiz o'smasin: eskirgan yozuvlarni vaqti-vaqti bilan tozalaymiz.
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key);
  }
}

const unavailable = (message: string) => new ApiException("internal_error", message, 503);

export async function askStoreAi(db: Database, userId: string, input: StoreAiInput): Promise<{ text: string }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw unavailable("AI yordamchi hali sozlanmagan.");
  await requireSignedIn(db, userId, "AI yordamchidan foydalanish");
  takeQuota(userId);

  const { text: catalog, books } = await catalogForAi(db);
  const persona = `Sen Bir Ilm Book Store'ning AI yordamchisisan. Faqat o'zbek tilida (lotin yozuvida), qisqa va aniq javob ber.
Kitob tavsiya qilganda FAQAT quyidagi katalogdan tanla (id | nom | muallif | janr | narx | sahifa). Katalogda yo'q kitobni do'kon mahsuloti sifatida taklif qilma.
Mutolaa rejasi so'ralsa, sahifa sonini kunlarga bo'lib, aniq kunlik reja tuz. Kitob mazmunida ishonchsiz bo'lsang, shuni ochiq ayt.
Katalog:
${catalog || "(hozircha sotuvda kitob yo'q)"}`;

  let turns: { role: "user" | "model"; text: string }[];
  if (input.mode === "summary") {
    const book = books.find((b) => b.id === input.bookId);
    if (!book) throw notFound("Kitob topilmadi.");
    turns = [{ role: "user", text: `"${book.title}" (${book.author}) kitobi uchun: 1) Asosiy g'oya, 2) 3-5 ta asosiy xulosa, 3) Kim o'qishi kerak — bo'limlari bilan qisqa xulosa yoz.` }];
  } else {
    turns = input.messages;
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: persona }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: { temperature: 0.6, maxOutputTokens: 800 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw unavailable("AI xizmatiga ulanib bo'lmadi.");
  }
  if (!response.ok) {
    console.error("[store-ai] Gemini javobi:", response.status);
    throw unavailable("AI hozir javob bera olmadi. Keyinroq urinib ko'ring.");
  }

  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) throw unavailable("AI bo'sh javob qaytardi.");
  return { text };
}

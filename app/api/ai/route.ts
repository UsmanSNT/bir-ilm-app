import { env } from "cloudflare:workers";
import { books } from "@/app/app-data";
import { catalogForAi } from "@/app/store-data";

export const runtime = "edge";

type Turn = { role: "user" | "model"; text: string };

const MAX_TURNS = 12;
const MAX_TEXT = 1000;

const persona = `Sen Bir Ilm Book Store'ning AI yordamchisisan. Faqat o'zbek tilida (lotin yozuvida), qisqa va aniq javob ber.
Kitob tavsiya qilganda FAQAT quyidagi katalogdan tanla (id | nom | muallif | janr | narx | sahifa). Katalogda yo'q kitobni do'kon mahsuloti sifatida taklif qilma.
Mutolaa rejasi so'ralsa, sahifa sonini kunlarga bo'lib, aniq kunlik reja tuz. Kitob mazmunida ishonchsiz bo'lsang, shuni ochiq ayt.
Katalog:
${catalogForAi()}`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function parseTurns(value: unknown): Turn[] | null {
  if (!Array.isArray(value) || !value.length || value.length > MAX_TURNS) return null;
  const turns: Turn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { role, text } = item as Record<string, unknown>;
    if ((role !== "user" && role !== "model") || typeof text !== "string") return null;
    const clean = text.trim().slice(0, MAX_TEXT);
    if (!clean) return null;
    turns.push({ role, text: clean });
  }
  return turns[turns.length - 1].role === "user" && turns[0].role === "user" ? turns : null;
}

export async function POST(request: Request) {
  const key = env.GEMINI_API_KEY;
  if (!key) return json({ error: "ai_not_configured" }, 503);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return json({ error: "bad_request" }, 400); }

  let turns: Turn[] | null;
  const system = persona;
  if (body.mode === "summary") {
    const book = books.find(b => b.id === body.bookId);
    if (!book) return json({ error: "unknown_book" }, 400);
    turns = [{ role: "user", text: `"${book.title}" (${book.author}) kitobi uchun: 1) Asosiy g'oya, 2) 3-5 ta asosiy xulosa, 3) Kim o'qishi kerak — bo'limlari bilan qisqa xulosa yoz.` }];
  } else {
    turns = parseTurns(body.messages);
    if (!turns) return json({ error: "bad_request" }, 400);
  }

  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  let upstream: Response;
  try {
    upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map(t => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: { temperature: 0.6, maxOutputTokens: 800 },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return json({ error: "upstream_unreachable" }, 502);
  }
  if (!upstream.ok) return json({ error: "upstream_error" }, 502);

  const data = (await upstream.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("").trim();
  return text ? json({ text }) : json({ error: "empty_response" }, 502);
}

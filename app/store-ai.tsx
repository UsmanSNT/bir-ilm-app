"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";

export type AiTurn = { role: "user" | "model"; text: string };

const prompts = ["Menga biznes kitoblari tavsiya qil", "Menga startup uchun kitob top", "Menga motivatsion kitoblar kerak", "Atom odatlar uchun 7 kunlik mutolaa rejasi tuz"];

const errorText: Record<string, string> = {
  ai_not_configured: "AI yordamchi hali sozlanmagan (GEMINI_API_KEY kerak).",
  upstream_unreachable: "AI xizmatiga ulanib bo‘lmadi. Birozdan keyin urinib ko‘ring.",
};

export async function askAi(body: unknown): Promise<string> {
  try {
    const res = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json()) as { text?: string; error?: string };
    if (res.ok && data.text) return data.text;
    return errorText[data.error ?? ""] ?? "AI javob bera olmadi. Qayta urinib ko‘ring.";
  } catch {
    return errorText.upstream_unreachable;
  }
}

export default function StoreAi() {
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns, busy]);

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    const next: AiTurn[] = [...turns, { role: "user", text: clean }];
    setTurns(next); setInput(""); setBusy(true);
    const reply = await askAi({ messages: next.slice(-10) });
    setTurns(t => [...t, { role: "model", text: reply }]);
    setBusy(false);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void send(input); };

  return <section className="store-ai" aria-label="AI yordamchi">
    <div className="store-ai-log" aria-live="polite">
      {!turns.length && <div className="store-empty"><Sparkles size={28}/><h3>Qanday kitob qidiryapsiz?</h3>
        <div className="store-ai-prompts">{prompts.map(p => <button key={p} type="button" onClick={() => void send(p)}>{p}</button>)}</div></div>}
      {turns.map((t, i) => <div key={i} className={`store-ai-msg ${t.role}`}>{t.text}</div>)}
      {busy && <div className="store-ai-msg model">Yozmoqda...</div>}
      <div ref={end}/>
    </div>
    <form className="store-ai-form" onSubmit={submit}>
      <input aria-label="AI yordamchiga xabar" maxLength={1000} value={input} onChange={e => setInput(e.target.value)} placeholder="Savolingizni yozing..."/>
      <button disabled={busy || !input.trim()} aria-label="Yuborish"><Send size={19}/></button>
    </form>
  </section>;
}

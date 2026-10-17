"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { askStoreAi, StoreError } from "@/lib/api/store-client";
import { STORE_LIMITS } from "@/shared/contract";
import { FormattedText } from "./store-ui";

type Turn = { role: "user" | "model"; text: string };

const prompts = ["Menga biznes kitoblari tavsiya qil", "Boshlovchi uchun qaysi kitob mos?", "Menga motivatsion kitoblar kerak", "Bir haftalik mutolaa rejasi tuz"];

/** AI javobi yoki foydalanuvchiga tushunarli xato matni. 401 — kirish kerak. */
export async function askAi(input: Parameters<typeof askStoreAi>[0]): Promise<{ text: string; needsLogin: boolean }> {
  try {
    return { text: await askStoreAi(input), needsLogin: false };
  } catch (error) {
    const needsLogin = error instanceof StoreError && error.status === 401;
    return { text: error instanceof Error ? error.message : "AI javob bera olmadi.", needsLogin };
  }
}

export default function StoreAi({ onNeedLogin }: { onNeedLogin: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns, busy]);

  const send = async (text: string) => {
    const clean = text.trim().slice(0, STORE_LIMITS.aiText);
    if (!clean || busy) return;
    const next: Turn[] = [...turns, { role: "user", text: clean }];
    setTurns(next);
    setInput("");
    setBusy(true);
    // Server suhbat foydalanuvchidan boshlanishini talab qiladi — oxirgi juft sondagi navbatlar yuboriladi.
    const recent = next.slice(-(STORE_LIMITS.aiTurns - 1));
    const history = recent[0]?.role === "user" ? recent : recent.slice(1);
    const reply = await askAi({ mode: "chat", messages: history });
    setBusy(false);
    if (reply.needsLogin) {
      setTurns(turns);
      setInput(clean);
      onNeedLogin();
      return;
    }
    setTurns((t) => [...t, { role: "model", text: reply.text }]);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void send(input); };

  return (
    <section className="store-ai" aria-label="AI yordamchi">
      <div className="store-ai-log" aria-live="polite">
        {!turns.length && (
          <div className="store-empty">
            <Sparkles size={28} />
            <h3>Qanday kitob qidiryapsiz?</h3>
            <div className="store-ai-prompts">{prompts.map((p) => <button key={p} type="button" onClick={() => void send(p)}>{p}</button>)}</div>
          </div>
        )}
        {turns.map((t, i) => <div key={i} className={`store-ai-msg ${t.role}`}>{t.role === "model" ? <FormattedText text={t.text} /> : t.text}</div>)}
        {busy && <div className="store-ai-msg model">Yozmoqda...</div>}
        <div ref={end} />
      </div>
      <form className="store-ai-form" onSubmit={submit}>
        <input aria-label="AI yordamchiga xabar" maxLength={STORE_LIMITS.aiText} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Savolingizni yozing..." />
        <button disabled={busy || !input.trim()} aria-label="Yuborish"><Send size={19} /></button>
      </form>
    </section>
  );
}

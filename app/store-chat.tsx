"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, ImagePlus, Send, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { fetchAdminThread, fetchChat, sendAdminImage, sendAdminReply, sendChatImage, sendChatMessage, StoreError } from "@/lib/api/store-client";
import { STORE_CHAT_IMAGE_TYPES, STORE_LIMITS, type StoreMessage } from "@/shared/contract";

const POLL_MS = 4000;

const timeOf = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? hm : `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })} ${hm}`;
};

/** Yozishmani yuklaydi va har bir necha soniyada yangilarini so'raydi (faqat ko'rinib turganda). */
function useThread(load: (after: number) => Promise<StoreMessage[]>, key: string) {
  const [messages, setMessages] = useState<StoreMessage[] | null>(null);
  const [error, setError] = useState("");
  const lastId = useRef(0);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  const append = useCallback((incoming: StoreMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set((prev ?? []).map((m) => m.id));
      return [...(prev ?? []), ...incoming.filter((m) => !seen.has(m.id))];
    });
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
  }, []);

  useEffect(() => {
    let alive = true;
    lastId.current = 0;
    const tick = async (first: boolean) => {
      if (!first && document.visibilityState !== "visible") return;
      try {
        const next = await loadRef.current(lastId.current);
        if (!alive) return;
        if (first) setMessages([]);
        append(next);
        setError("");
      } catch (e) {
        if (alive && first) { setMessages([]); setError(e instanceof Error ? e.message : "Yuklanmadi."); }
      }
    };
    void tick(true);
    const timer = setInterval(() => void tick(false), POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [key, append]);

  return { messages, error, append };
}

function Bubble({ m, mine, onZoom }: { m: StoreMessage; mine: boolean; onZoom: (url: string) => void }) {
  return (
    <li className={`zc-msg ${mine ? "is-mine" : "is-theirs"}${m.kind === "order" ? " is-order" : ""}`}>
      {m.kind === "order" && <span className="zc-tag"><ShoppingBag size={13} />Buyurtma</span>}
      {m.bookTitle && <span className="zc-tag"><BookOpen size={13} />{m.bookTitle}</span>}
      {m.imageUrl && (
        <button type="button" className="zc-image" onClick={() => onZoom(m.imageUrl!)} aria-label="Rasmni kattalashtirish">
          <img src={m.imageUrl} alt={m.body || "Yuborilgan rasm"} loading="lazy" />
        </button>
      )}
      {m.body && <p>{m.body}</p>}
      <time dateTime={m.createdAt}>{timeOf(m.createdAt)}</time>
    </li>
  );
}

type Props = {
  /** Xabarni yozgan tomon: xaridor oynasida "user", admin oynasida "admin". */
  me: "user" | "admin";
  /** Admin oynasida — qaysi xaridor bilan. */
  customerId?: string;
  /** Kitob sahifasidan ochilsa — birinchi xabar shu kitob haqida. */
  bookId?: string;
  bookTitle?: string;
  onNeedLogin?: () => void;
  empty: string;
};

/** Xaridor ↔ admin yozishmasi (ikkala tomon uchun bitta komponent). */
export default function StoreChatThread({ me, customerId, bookId, bookTitle, onNeedLogin, empty }: Props) {
  const { messages, error, append } = useThread(
    async (after) => (me === "admin" ? (await fetchAdminThread(customerId!, after)).messages : (await fetchChat(after)).messages),
    `${me}:${customerId ?? ""}`,
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [aboutBook, setAboutBook] = useState(bookId);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages?.length]);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  async function run(action: () => Promise<StoreMessage>) {
    setBusy(true);
    try {
      append([await action()]);
      return true;
    } catch (e) {
      if (e instanceof StoreError && e.status === 401 && onNeedLogin) onNeedLogin();
      else toast.error(e instanceof Error ? e.message : "Yuborilmadi.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    const ok = await run(() => (me === "admin" ? sendAdminReply(customerId!, body) : sendChatMessage(body, aboutBook)));
    if (ok) { setDraft(""); setAboutBook(undefined); }
  }

  async function pick(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file || busy) return;
    if (!(STORE_CHAT_IMAGE_TYPES as readonly string[]).includes(file.type)) return void toast.error("Faqat JPG, PNG yoki WebP rasm yuboring.");
    if (file.size > STORE_LIMITS.chatImageBytes) return void toast.error("Rasm 5 MB dan oshmasin.");
    await run(() => (me === "admin" ? sendAdminImage(customerId!, file) : sendChatImage(file)));
  }

  return (
    <div className="zc">
      <ul className="zc-list" aria-live="polite" aria-label="Yozishma">
        {messages === null && <li className="zc-note" role="status">Yuklanmoqda…</li>}
        {error && <li className="zc-note" role="alert">{error}</li>}
        {messages?.length === 0 && !error && <li className="zc-note">{empty}</li>}
        {messages?.map((m) => <Bubble key={m.id} m={m} mine={m.sender === me} onZoom={setZoom} />)}
        <div ref={endRef} />
      </ul>

      {aboutBook && bookTitle && (
        <p className="zc-about"><BookOpen size={14} />«{bookTitle}» haqida yozasiz <button type="button" onClick={() => setAboutBook(undefined)} aria-label="Kitobni olib tashlash">×</button></p>
      )}
      <form className="zc-form" onSubmit={(e) => void submit(e)}>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        <button type="button" className="zc-attach" onClick={() => fileRef.current?.click()} disabled={busy} aria-label={me === "admin" ? "Rasm yuborish" : "Chek rasmini yuborish"} title={me === "admin" ? "Rasm yuborish" : "Chek rasmini yuborish"}>
          <ImagePlus size={20} />
        </button>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={STORE_LIMITS.chatBody} placeholder={me === "admin" ? "Javob yozing…" : "Xabar yozing…"} aria-label="Xabar matni" autoComplete="off" />
        <button className="zc-send" disabled={busy || !draft.trim()} aria-label="Yuborish"><Send size={18} /></button>
      </form>

      {zoom && (
        <div className="zc-zoom" role="dialog" aria-modal="true" aria-label="Rasm" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Kattalashtirilgan rasm" />
        </div>
      )}
    </div>
  );
}

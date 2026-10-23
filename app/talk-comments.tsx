"use client";

/**
 * Suhbat izohlari oynasi (faqat admin va moderator). Efirda izohlar suzib o'tib yo'qoladi va oddiy
 * foydalanuvchiga suhbatdan keyin ko'rinmaydi; bu oyna ularning to'liq ro'yxatini beradi. Har izoh yonida
 * suhbat boshidan necha daqiqa o'tgani turadi — yozuvdan o'sha joyni topish oson.
 */
import { useCallback, useEffect, useState } from "react";
import { MessageCircle, RotateCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchLiveMessages } from "@/lib/api/live-client";
import type { LiveMessage, LiveSession } from "@/shared/contract/live";
import { Avatar } from "./live-avatar";
import { clock, dayMonth } from "./talk-format";

type Talk = Pick<LiveSession, "id" | "bookTitle" | "title" | "scheduledAt" | "startedAt">;

export default function TalkComments({ talk, onClose }: { talk: Talk; onClose: () => void }) {
  const [items, setItems] = useState<LiveMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const started = Date.parse(talk.startedAt ?? talk.scheduledAt);

  /** `after` — oxirgi yuklangan sahifaning kursori (`null` — boshidan). */
  const load = useCallback(async (after: string | null) => {
    setState("loading");
    const page = await fetchLiveMessages(talk.id, after).catch(() => "Internet aloqasini tekshirib, qayta urinib ko‘ring.");
    if (typeof page === "string") {
      setError(page);
      setState("error");
      return;
    }
    setItems((prev) => (after ? [...prev, ...page.items] : page.items));
    setCursor(page.nextCursor);
    setState("ready");
  }, [talk.id]);

  useEffect(() => {
    queueMicrotask(() => void load(null));
  }, [load]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="talk-comments"
        // Fokus oynaning o'zida turadi (yopish tugmasida halqa ko'rinmasin); Tab bilan tugmalarga o'tiladi.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogTitle><MessageCircle size={20} aria-hidden="true" /> Suhbat izohlari</DialogTitle>
        <DialogDescription>
          «{talk.bookTitle} – {talk.title}» · {dayMonth(new Date(started))}. Faqat admin va moderator ko‘radi.
        </DialogDescription>

        {items.length > 0 && (
          <ol className="talk-comments-list">
            {items.map((msg) => {
              const at = new Date(msg.createdAt);
              const minute = Math.floor((at.getTime() - started) / 60_000);
              return (
                <li key={msg.id}>
                  <Avatar name={msg.userName} />
                  <div>
                    <p className="talk-comments-meta">
                      <strong>{msg.userName}</strong>
                      <time dateTime={msg.createdAt}>{clock(at)}</time>
                      {minute >= 0 && <span title="Suhbat boshidan">{minute}-daqiqa</span>}
                    </p>
                    <p className="talk-comments-body">{msg.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {state === "loading" && <p className="talk-comments-note" role="status">Yuklanmoqda…</p>}
        {state === "ready" && !items.length && <p className="talk-comments-note">Bu suhbatda izoh yozilmagan.</p>}
        {state === "error" && (
          <p className="talk-comments-note is-error" role="alert">
            {error}
            <button type="button" onClick={() => void load(items.length ? cursor : null)}><RotateCw size={14} /> Qayta urinish</button>
          </p>
        )}
        {state === "ready" && cursor && (
          <button type="button" className="talk-comments-more" onClick={() => void load(cursor)}>Yana yuklash</button>
        )}
        {state === "ready" && !cursor && items.length > 0 && <p className="talk-comments-note">Jami: {items.length} ta izoh</p>}
      </DialogContent>
    </Dialog>
  );
}

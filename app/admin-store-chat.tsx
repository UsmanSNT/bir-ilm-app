"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { fetchAdminThreads } from "@/lib/api/store-client";
import type { StoreThread } from "@/shared/contract";
import StoreChatThread from "./store-chat";

const POLL_MS = 8000;
const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Admin: do'kon yozishmalari — buyurtmalar va kitoblar bo'yicha savollar bir joyda, har biriga alohida javob. */
export default function AdminStoreChat() {
  const [threads, setThreads] = useState<StoreThread[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<StoreThread | null>(null);

  useEffect(() => {
    if (open) return;
    let alive = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      fetchAdminThreads()
        .then((d) => { if (alive) { setThreads(d.items); setError(""); } })
        .catch((e: Error) => { if (alive) { setThreads((prev) => prev ?? []); setError(e.message); } });
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [open]);

  if (open) {
    return (
      <div className="admin-panel admin-chat">
        <button type="button" className="admin-chat-back" onClick={() => setOpen(null)}><ArrowLeft size={17} />Barcha yozishmalar</button>
        <h3 className="admin-chat-title">{open.name}</h3>
        <StoreChatThread me="admin" customerId={open.userId} empty="Hali xabar yo‘q." />
      </div>
    );
  }

  return (
    <div className="admin-panel admin-chat">
      <p className="admin-intro">Xaridorlarning buyurtmalari va kitoblar bo‘yicha savollari shu yerga tushadi. Hisob raqamni shu yerda yuboring, chek rasmini ham shu yerda qabul qilasiz.</p>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {threads === null && <p className="admin-empty">Yuklanmoqda…</p>}
      {threads?.length === 0 && !error && <p className="admin-empty">Hali yozishma yo‘q.</p>}
      <ul className="admin-threads">
        {threads?.map((t) => (
          <li key={t.userId}>
            <button type="button" onClick={() => setOpen(t)} className={t.unread ? "has-unread" : ""}>
              <span className="admin-avatar">{t.name.slice(0, 1).toUpperCase() || "K"}</span>
              <span className="admin-thread-info">
                <strong>{t.name}</strong>
                <small>{t.lastPreview || "—"}</small>
              </span>
              <span className="admin-thread-meta">
                <time dateTime={t.lastMessageAt}>{when(t.lastMessageAt)}</time>
                {t.unread > 0 && <b aria-label={`${t.unread} ta o‘qilmagan`}>{t.unread}</b>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {threads && threads.length > 0 && <p className="admin-empty"><MessageCircle size={14} /> Ro‘yxat o‘zi yangilanadi.</p>}
    </div>
  );
}

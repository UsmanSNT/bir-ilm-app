"use client";

/**
 * Kun hikmati: bosh sahifadagi karta, ilovaga kirganda chiqadigan modal oyna (Yuborish, Saqlash, Yopish)
 * va admin uchun tahrirlash oynasi. Ma'lumot `useWisdom` dan (server: hamma uchun bir xil bugungi hikmat).
 */
import { FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Leaf, Link2, Pencil, Plus, Send, Star, Trash2, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createWisdom, deleteWisdom, notifySiteChanged, updateWisdom } from "@/lib/api/site-client";
import { WISDOM_LIMITS, type Wisdom } from "@/shared/contract";
import { saveWisdomImage, shareWisdom, wisdomLink } from "./wisdom-share";

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

/** Bosh sahifadagi karta: bosilsa modal ochiladi; admin uchun tahrirlash tugmasi. */
export function WisdomCard({ wisdom, admin, onOpen, onEdit }: { wisdom: Wisdom; admin: boolean; onOpen: () => void; onEdit: () => void }) {
  return (
    <div className="m-wisdom-wrap">
      <button type="button" className="m-wisdom" onClick={onOpen} aria-label={`Kun hikmati: ${wisdom.text}. Ulashish yoki saqlash`}>
        <span className="m-wisdom-band" aria-hidden="true" />
        <span className="m-wisdom-caption"><Leaf size={14} /> Kun hikmati <Leaf size={14} className="m-leaf-flip" /></span>
        <span className="m-wisdom-quote">{wisdom.text}</span>
        <span className="m-wisdom-sign">— {wisdom.author}</span>
        <span className="m-wisdom-share" aria-hidden="true"><Send size={13} /> Ulashish</span>
      </button>
      {admin && (
        <button type="button" className="m-wisdom-edit" onClick={onEdit} aria-label="Kun hikmatlarini tahrirlash" title="Tahrirlash">
          <Pencil size={15} />
        </button>
      )}
    </div>
  );
}

const SEEN_KEY = "bir-wisdom-shown";
/** Ilovadan shuncha vaqt chiqib turib qaytilsa, hikmat yana ko'rsatiladi. */
const AWAY_MS = 30 * 60_000;

/**
 * Hikmat oynasini qachon ochish: ilovaga (sahifaga) yangi kirganda bir marta va uzoq (30 daqiqa+) chiqib qaytganda.
 * Sahifa havola orqali (masalan, post yoki parol tiklash) ochilgan bo'lsa, u ishga xalaqit bermasligi uchun ochilmaydi.
 * `enabled` — foydalanuvchi bosh sahifada (viktorina o'ynayotgan payt to'xtatilmaydi).
 */
export function useWisdomPrompt(ready: boolean, enabled: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  const deepLink = useRef(typeof window !== "undefined" && window.location.search.length > 1);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!ready || deepLink.current) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* Saqlov yopiq: oyna bir marta ko'rsatiladi, keyingi kirishda yana. */
    }
    if (!seen && enabledRef.current) queueMicrotask(() => setOpen(true));
  }, [ready]);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= AWAY_MS && enabledRef.current) setOpen(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return [open, setOpen];
}

/** Kirishda chiqadigan oyna: hikmat, ulashiladigan qisqa havola, Yuborish / Saqlash / Yopish. */
export function WisdomDialog({ open, onOpenChange, wisdom, admin, onEdit }: { open: boolean; onOpenChange: (open: boolean) => void; wisdom: Wisdom; admin: boolean; onEdit: () => void }) {
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  const [now] = useState(() => new Date());
  const link = wisdom.id ? wisdomLink(wisdom.id) : null;

  async function share() {
    setBusy("share");
    try {
      const result = await shareWisdom(wisdom);
      if (result !== "cancelled") toast.success(result === "telegram" ? "Telegram ochildi — suhbatni tanlang" : "Hikmat yuborildi");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    try {
      if ((await saveWisdomImage(wisdom)) === "saved") toast.success("Hikmat rasmi saqlandi");
    } catch {
      toast.error("Rasmni saqlab bo‘lmadi. Qayta urinib ko‘ring.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="wisdom-dialog"
        showCloseButton={false}
        // O'zi ochilgan oynada fokus oynaning o'zida turadi (yopish tugmasida halqa ko'rinmasin); Tab bilan tugmalarga o'tiladi.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <span className="wisdom-band" aria-hidden="true" />
        <DialogClose className="wisdom-x" aria-label="Yopish"><X size={18} /></DialogClose>
        <p className="wisdom-date">{now.getDate()}-{MONTHS[now.getMonth()]}, {WEEKDAYS[now.getDay()]}</p>
        <DialogTitle className="wisdom-eyebrow"><Leaf size={14} aria-hidden="true" /> Kun hikmati <Leaf size={14} className="m-leaf-flip" aria-hidden="true" /></DialogTitle>
        <DialogDescription asChild>
          <blockquote className="wisdom-quote">{wisdom.text}</blockquote>
        </DialogDescription>
        <p className="wisdom-author">— {wisdom.author}</p>
        <div className="wisdom-actions">
          <button type="button" className="wisdom-save" onClick={() => void save()} disabled={busy !== null} aria-busy={busy === "save" || undefined}>
            <Download size={18} /> {busy === "save" ? "Tayyorlanmoqda…" : "Saqlash"}
          </button>
          <button type="button" className="wisdom-send" onClick={() => void share()} disabled={busy !== null} aria-busy={busy === "share" || undefined}>
            <Send size={18} /> Yuborish
          </button>
        </div>
        {link && (
          <p className="wisdom-link" title="Yuboriladigan havola">
            <Link2 size={14} aria-hidden="true" /> {link.label}
          </p>
        )}
        <DialogClose className="wisdom-close">Yopish</DialogClose>
        {admin && (
          <button type="button" className="wisdom-admin" onClick={onEdit}>
            <Pencil size={14} /> Hikmatlarni tahrirlash
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Draft = { id: string | null; text: string; author: string };
const EMPTY: Draft = { id: null, text: "", author: "" };

/** Admin: hikmat qo'shish, tahrirlash, bugunga belgilash va o'chirish. */
export function WisdomEditor({ open, onOpenChange, items, todayId }: { open: boolean; onOpenChange: (open: boolean) => void; items: Wisdom[]; todayId: string | null }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      notifySiteChanged();
      toast.success(done);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Saqlanmadi.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = { text: draft.text.trim(), author: draft.author.trim() };
    const ok = draft.id
      ? await run(() => updateWisdom(draft.id!, input), "Hikmat yangilandi")
      : await run(() => createWisdom(input), "Hikmat qo‘shildi");
    if (ok) setDraft(EMPTY);
  }

  function edit(item: Wisdom) {
    setDraft({ id: item.id, text: item.text, author: item.author === "Bir Ilm" ? "" : item.author });
    textRef.current?.focus();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="wisdom-editor">
        <DialogTitle>Kun hikmatlari</DialogTitle>
        <DialogDescription>Har kuni ro‘yxatdagi navbatdagisi ko‘rsatiladi. «Bugun» tugmasi bilan bugungi hikmatni o‘zingiz tanlaysiz.</DialogDescription>
        <form className="wisdom-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>{draft.id ? "Hikmatni tahrirlash" : "Yangi hikmat"}</span>
            <textarea ref={textRef} value={draft.text} maxLength={WISDOM_LIMITS.text} rows={3} required minLength={3} placeholder="Masalan: Bir sahifa ham hisoblanadi." onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
            <small>{draft.text.length}/{WISDOM_LIMITS.text}</small>
          </label>
          <label>
            <span>Muallif (ixtiyoriy)</span>
            <input value={draft.author} maxLength={WISDOM_LIMITS.author} placeholder="Bir Ilm" onChange={(e) => setDraft((d) => ({ ...d, author: e.target.value }))} />
          </label>
          <div className="wisdom-form-actions">
            {draft.id && <button type="button" className="ghost" disabled={busy} onClick={() => setDraft(EMPTY)}>Bekor qilish</button>}
            <button type="submit" className="button" disabled={busy || draft.text.trim().length < 3}>
              {draft.id ? "Saqlash" : <><Plus size={16} /> Qo‘shish</>}
            </button>
          </div>
        </form>
        <ol className="wisdom-list">
          {items.map((item) => (
            <li key={item.id} className={item.id === todayId ? "is-today" : undefined}>
              <p>
                {item.id === todayId && <b className="wisdom-today">Bugun</b>}
                {item.text}
                <small>— {item.author} · {item.id}</small>
              </p>
              <div>
                <button type="button" disabled={busy || item.id === todayId} aria-label="Bugun shu hikmatni ko‘rsatish" title="Bugun ko‘rsatish" onClick={() => void run(() => updateWisdom(item.id, { featureToday: true }), "Bugungi hikmat tanlandi")}>
                  <Star size={15} />
                </button>
                <button type="button" disabled={busy} aria-label="Tahrirlash" title="Tahrirlash" onClick={() => edit(item)}>
                  <Pencil size={15} />
                </button>
                <button type="button" className="is-danger" disabled={busy} aria-label="O‘chirish" title="O‘chirish" onClick={() => { if (window.confirm("Hikmat o‘chirilsinmi? Uning havolasi ham ishlamay qoladi.")) void run(() => deleteWisdom(item.id), "Hikmat o‘chirildi"); }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
          {!items.length && <li className="wisdom-empty">Hozircha hikmat yo‘q.</li>}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

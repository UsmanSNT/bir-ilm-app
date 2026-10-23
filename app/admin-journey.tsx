"use client";

import { FormEvent, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { importJourneyTitles, notifySiteChanged, removeJourneyTitle, saveJourneyTitle } from "@/lib/api/site-client";
import type { JourneyBook } from "@/shared/contract";
import { JOURNEY_LIMITS, type Anchor } from "@/shared/journey";
import { parseJourneyList } from "@/shared/journey-import";
import { uzDateTashkent } from "./uz-date";

const EXAMPLE = `247. Kichik shahzoda — Sent-Ekzyuperi
2026-10-10 | Alkimyogar | Paulo Koelo
03.10.2026  «Atom odatlar»
244-kitob: Barkamol farzand`;

/** Admin: bitta haftaning kitob nomi (o'tgan yoki rejadagi). */
export function JourneyTitleForm({ number, at, entry, onClose }: { number: number; at: number; entry: JourneyBook | null; onClose: () => void }) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [author, setAuthor] = useState(entry?.author ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const linked = Boolean(entry?.bookId);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      notifySiteChanged();
      toast.success(success);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy) void run(() => saveJourneyTitle(number, { title, author }), "Kitob nomi saqlandi");
  };

  return (
    <form className="admin-panel ab-admin" onSubmit={submit}>
      <p className="ab-journey-week"><b>{number}-kitob</b> · {uzDateTashkent(at)}, shanba</p>
      {linked ? (
        <p className="admin-hint">«{entry?.title}» — bu hafta kutubxonadagi kitob suhbatiga bog‘langan. Nomi kitob oynasidan (hafta kitobini tahrirlash) o‘zgaradi.</p>
      ) : (
        <>
          <label className="ab-admin-field">
            <span>Kitob nomi * <small>{title.length}/{JOURNEY_LIMITS.title}</small></span>
            <input required autoFocus maxLength={JOURNEY_LIMITS.title} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="ab-admin-field">
            <span>Muallif <small>ixtiyoriy</small></span>
            <input maxLength={JOURNEY_LIMITS.author} value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <button className="admin-add-book" disabled={busy || !title.trim()}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
          {entry && (
            <button type="button" className="ab-admin-btn ab-journey-remove" disabled={busy} onClick={() => void run(() => removeJourneyTitle(number), "Kitob nomi olib tashlandi")}>
              <Trash2 size={15} /> Nomini olib tashlash
            </button>
          )}
        </>
      )}
    </form>
  );
}

/** Admin: o'tgan kitoblar ro'yxatini matndan bir yo'la joylash. Joylashdan oldin nimalar tanilgani ko'rsatiladi. */
export function JourneyImportForm({ anchor, entries, onClose }: { anchor: Anchor; entries: JourneyBook[]; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parsed = useMemo(() => parseJourneyList(text, anchor), [text, anchor]);
  const existing = useMemo(() => new Map(entries.map((entry) => [entry.number, entry])), [entries]);

  const linked = parsed.rows.filter((row) => existing.get(row.number)?.bookId).length;
  const replacing = parsed.rows.filter((row) => existing.has(row.number) && !existing.get(row.number)?.bookId).length;
  const tooMany = parsed.rows.length > JOURNEY_LIMITS.importRows;
  const blocked = parsed.rows.length === 0 || parsed.issues.length > 0 || tooMany;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || blocked) return;
    setBusy(true);
    setError("");
    try {
      const result = await importJourneyTitles(parsed.rows);
      notifySiteChanged();
      toast.success(`${result.saved} ta kitob nomi saqlandi${result.skipped.length ? `, ${result.skipped.length} tasi o‘tkazib yuborildi` : ""}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="admin-panel ab-admin" onSubmit={(e) => void submit(e)}>
      <p className="admin-hint">Har qatorda: <b>raqam yoki sana</b>, kitob nomi va (ixtiyoriy) muallif. Muallifni <code>—</code>, <code>-</code> yoki <code>|</code> bilan ajrating. Sana shanba kuni bo‘lsin.</p>
      <pre className="ab-journey-example" aria-label="Namuna">{EXAMPLE}</pre>
      <label className="ab-admin-field">
        <span>Ro‘yxat <small>{parsed.rows.length} ta kitob tanildi</small></span>
        <textarea rows={10} spellCheck={false} placeholder={"Ro‘yxatni shu yerga joylang…"} value={text} onChange={(e) => setText(e.target.value)} />
      </label>

      {parsed.issues.length > 0 && (
        <div className="ab-journey-issues" role="alert">
          <strong>{parsed.issues.length} ta qator tushunilmadi — to‘g‘rilang:</strong>
          <ul>
            {parsed.issues.slice(0, 6).map((issue) => (
              <li key={issue.line}><b>{issue.line}-qator:</b> {issue.reason} <em>«{issue.text}»</em></li>
            ))}
          </ul>
          {parsed.issues.length > 6 && <small>…va yana {parsed.issues.length - 6} ta.</small>}
        </div>
      )}
      {tooMany && <p className="admin-error" role="alert">Bir yo‘la {JOURNEY_LIMITS.importRows} tadan ko‘p kitob joylab bo‘lmaydi.</p>}

      {parsed.rows.length > 0 && parsed.issues.length === 0 && (
        <div className="ab-journey-preview">
          <ol>
            {parsed.rows.slice(0, 5).map((row) => (
              <li key={row.number}><b>{row.number}</b> {row.title}{row.author ? <small> — {row.author}</small> : null}</li>
            ))}
          </ol>
          {parsed.rows.length > 5 && <small>…va yana {parsed.rows.length - 5} ta.</small>}
          {(replacing > 0 || linked > 0 || parsed.duplicates > 0) && (
            <p className="ab-journey-note">
              {replacing > 0 && <>Yozilgan {replacing} ta nom almashtiriladi. </>}
              {linked > 0 && <>{linked} ta hafta suhbatga bog‘langan — o‘tkazib yuboriladi. </>}
              {parsed.duplicates > 0 && <>{parsed.duplicates} ta raqam takrorlangan — oxirgisi olinadi.</>}
            </p>
          )}
        </div>
      )}

      {error && <p className="admin-error" role="alert">{error}</p>}
      <button className="admin-add-book" disabled={busy || blocked}>{busy ? "Saqlanmoqda…" : parsed.rows.length ? `Joylash — ${parsed.rows.length} ta kitob` : "Joylash"}</button>
    </form>
  );
}

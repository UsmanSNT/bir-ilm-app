"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useViewer } from "@/lib/api/roles-client";
import { notifySiteChanged, saveJourneySlot, useJourneySlots } from "@/lib/api/site-client";
import type { JourneySlot } from "@/shared/contract";
import { JOURNEY_LIMITS, saturdaySessionAt } from "@/shared/journey";
import { useNow } from "./talk-format";
import { uzDateTashkent, uzDays } from "./uz-date";

/** Muhokama sanasi (shanba): "28-noyabr, 2026 · shanba". */
function dateLabel(discussedOn: string): string {
  const at = saturdaySessionAt(discussedOn);
  return at === null ? discussedOn : `${uzDateTashkent(at)} · ${uzDays[6]}`;
}

/** Shu kundan keyin muhokama (hali bo'lmagan) — "Rejada" belgisi. */
function isPlanned(discussedOn: string, now: number): boolean {
  const at = saturdaySessionAt(discussedOn);
  return at !== null && at > now;
}

export default function JourneyShelfPage({ onBack }: { onBack: () => void }) {
  const { value: slots, loading } = useJourneySlots();
  const role = useViewer()?.role;
  const canEdit = role === "admin" || role === "moderator";
  const [selected, setSelected] = useState<JourneySlot | null>(null);
  // Yangilari yuqorida: eng birinchi kitob pastda.
  const ordered = useMemo(() => [...slots].sort((a, b) => b.number - a.number), [slots]);
  const now = useNow(60_000);

  return (
    <main className="jshelf" aria-labelledby="jshelf-title">
      <header className="jshelf-head">
        <button type="button" className="jshelf-back" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" /> Orqaga
        </button>
        <h1 id="jshelf-title">Bir Ilm yo‘li</h1>
        <p>{ordered.length} ta hafta · yangi kitoblar yuqorida</p>
      </header>

      {loading && slots.length === 0 ? (
        <p className="jshelf-empty">Yuklanmoqda…</p>
      ) : (
        <ul className="jshelf-grid">
          {ordered.map((slot) => (
            <li key={slot.number}>
              <button type="button" className="jshelf-card" onClick={() => setSelected(slot)} aria-label={`${slot.number}-kitob: ${slot.title || "nomi yozilmagan"}`}>
                <span className="jshelf-cover">
                  {slot.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slot.coverUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="jshelf-blank" aria-hidden="true">
                      <BookOpen size={26} />
                    </span>
                  )}
                  {isPlanned(slot.discussedOn, now) && <span className="jshelf-badge">Rejada</span>}
                </span>
                <span className="jshelf-num">№{slot.number}</span>
                <span className="jshelf-title">{slot.title || "Nomi yozilmagan"}</span>
                {slot.author && <span className="jshelf-author">{slot.author}</span>}
                <span className="jshelf-date">{dateLabel(slot.discussedOn)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <SlotDialog
          key={selected.number}
          slot={selected}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
          onSaved={(item) => setSelected(item)}
        />
      )}
    </main>
  );
}

function SlotDialog({ slot, canEdit, onClose, onSaved }: { slot: JourneySlot; canEdit: boolean; onClose: () => void; onSaved: (item: JourneySlot) => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(slot.title);
  const [author, setAuthor] = useState(slot.author);
  const [summary, setSummary] = useState(slot.summary);
  const [moderator, setModerator] = useState(slot.moderator);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const item = await saveJourneySlot(slot.number, { title, author, summary, moderator });
      toast.success("Saqlandi");
      notifySiteChanged();
      onSaved(item);
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Saqlanmadi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="jshelf-dialog">
        <DialogTitle>{slot.number}-kitob</DialogTitle>
        <DialogDescription>{dateLabel(slot.discussedOn)}</DialogDescription>

        {editing ? (
          <form className="jshelf-form" onSubmit={save}>
            <label>
              Kitob nomi
              <input value={title} maxLength={JOURNEY_LIMITS.title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              Muallif
              <input value={author} maxLength={JOURNEY_LIMITS.author} onChange={(e) => setAuthor(e.target.value)} />
            </label>
            <label>
              Kitob haqida
              <textarea rows={6} value={summary} maxLength={JOURNEY_LIMITS.summary} onChange={(e) => setSummary(e.target.value)} />
            </label>
            <label>
              Moderator (ixtiyoriy)
              <input value={moderator} maxLength={JOURNEY_LIMITS.moderator} onChange={(e) => setModerator(e.target.value)} />
            </label>
            <div className="jshelf-actions">
              <button type="button" onClick={() => setEditing(false)} disabled={busy}>Bekor qilish</button>
              <button type="submit" disabled={busy}>Saqlash</button>
            </div>
          </form>
        ) : (
          <div className="jshelf-detail">
            <h2>{slot.title || "Nomi yozilmagan"}</h2>
            {slot.author && <p className="jshelf-author">{slot.author}</p>}
            {slot.summary ? <p className="jshelf-summary">{slot.summary}</p> : <p className="jshelf-muted">Kitob haqida ma’lumot hali kiritilmagan.</p>}
            {slot.moderator && <p className="jshelf-muted">Moderator: {slot.moderator}</p>}
            {canEdit && (
              <button type="button" className="jshelf-edit" onClick={() => setEditing(true)}>
                <Pencil size={16} aria-hidden="true" /> Tahrirlash
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

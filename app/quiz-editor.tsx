"use client";

import { FormEvent, useState } from "react";
import { ArrowDown, ArrowUp, CalendarClock, Copy, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCatalog } from "@/lib/api/books-client";
import { addQuizSession, createQuiz, deleteQuiz, notifyQuizzesChanged, removeQuizSession, updateQuiz } from "@/lib/api/quiz-client";
import { QUIZ_LIMITS, type Quiz } from "@/shared/contract";
import DateTimeField, { formatWhen } from "./datetime-field";
import { localInput } from "./talk-format";

type Draft = { key: string; prompt: string; choices: string[]; answer: number };

const blank = (): Draft => ({ key: crypto.randomUUID(), prompt: "", choices: ["", ""], answer: 0 });

/** Viktorina yaratish va tahrirlash: kitob, nom va savollar (har birida to'g'ri javob belgilanadi). */
export default function QuizEditor({ quiz, bookId, onClose }: { quiz: Quiz | null; /** Yangi viktorina uchun oldindan tanlangan kitob. */ bookId?: string | null; onClose: () => void }) {
  const catalog = useCatalog();
  const [title, setTitle] = useState(quiz?.title ?? "");
  const [book, setBook] = useState(quiz?.bookId ?? bookId ?? "");
  const [questions, setQuestions] = useState<Draft[]>(() =>
    quiz ? quiz.questions.map((q) => ({ key: crypto.randomUUID(), prompt: q.prompt, choices: [...q.choices], answer: q.answer })) : [blank()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Jonli vaqtlar: har birining o'z kirish kodi bor. Ro'yxat serverdan kelgan javob bilan yangilanadi.
  const [sessions, setSessions] = useState(quiz?.sessions ?? []);
  const [newWhen, setNewWhen] = useState("");

  async function addSession() {
    if (!quiz || !newWhen) return;
    setBusy(true);
    setError("");
    try {
      const updated = await addQuizSession(quiz.id, new Date(newWhen).toISOString());
      setSessions(updated.sessions);
      setNewWhen("");
      notifyQuizzesChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vaqt qo‘shilmadi.");
    } finally {
      setBusy(false);
    }
  }

  async function dropSession(id: string) {
    if (!quiz || !window.confirm("Bu vaqt va uning kodi o‘chirilsinmi?")) return;
    setBusy(true);
    try {
      setSessions((await removeQuizSession(quiz.id, id)).sessions);
      notifyQuizzesChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "O‘chirilmadi.");
    } finally {
      setBusy(false);
    }
  }

  const copyCode = (code: string) => {
    void navigator.clipboard?.writeText(code).then(() => toast.success("Kod nusxalandi."), () => {});
  };

  const patch = (key: string, change: (q: Draft) => Draft) => setQuestions((prev) => prev.map((q) => (q.key === key ? change(q) : q)));
  const move = (index: number, dir: -1 | 1) =>
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  function pickBook(id: string) {
    setBook(id);
    // Nom bo'sh bo'lsa, kitob nomi taklif qilinadi.
    const found = catalog.items.find((b) => b.id === id);
    if (found && !title.trim()) setTitle(found.title);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const input = {
      title: title.trim(),
      bookId: book || null,
      questions: questions.map((q) => ({ prompt: q.prompt.trim(), choices: q.choices.map((c) => c.trim()), answer: q.answer })),
    };
    try {
      if (quiz) await updateQuiz(quiz.id, input);
      else await createQuiz(input);
      notifyQuizzesChanged();
      toast.success(quiz ? "Viktorina saqlandi." : "Viktorina qo‘shildi.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saqlanmadi.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!quiz || !window.confirm(`«${quiz.title}» viktorinasi o‘chirilsinmi?`)) return;
    setBusy(true);
    try {
      await deleteQuiz(quiz.id);
      notifyQuizzesChanged();
      toast.success("Viktorina o‘chirildi.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "O‘chirilmadi.");
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="book-editor quiz-editor">
        <DialogTitle className="sr-only">{quiz ? "Viktorinani tahrirlash" : "Yangi viktorina"}</DialogTitle>
        <DialogDescription className="sr-only">Kitob bo‘yicha savollar va to‘g‘ri javoblarni kiriting.</DialogDescription>
        <form onSubmit={save}>
          <label className="qe-field">
            <span>Kitob</span>
            <select value={book} disabled={busy} onChange={(e) => pickBook(e.target.value)} aria-label="Kitob">
              <option value="">Kitobsiz (umumiy)</option>
              {catalog.items.map((b) => <option key={b.id} value={b.id}>{b.title} — {b.author}</option>)}
            </select>
          </label>
          <input aria-label="Viktorina nomi" placeholder="Viktorina nomi" maxLength={QUIZ_LIMITS.title} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} required />

          <ol className="qe-list">
            {questions.map((q, index) => (
              <li key={q.key} className="qe-q">
                <div className="qe-q-head">
                  <b>{index + 1}-savol</b>
                  <span>
                    <button type="button" aria-label="Yuqoriga" disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
                    <button type="button" aria-label="Pastga" disabled={busy || index === questions.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
                    <button type="button" aria-label="Savolni o‘chirish" disabled={busy || questions.length === 1} onClick={() => setQuestions((prev) => prev.filter((x) => x.key !== q.key))}><Trash2 size={15} /></button>
                  </span>
                </div>
                <textarea aria-label={`${index + 1}-savol matni`} placeholder="Savol matni" rows={2} maxLength={QUIZ_LIMITS.prompt} value={q.prompt} disabled={busy} onChange={(e) => patch(q.key, (x) => ({ ...x, prompt: e.target.value }))} />
                <div className="qe-choices" role="radiogroup" aria-label="To‘g‘ri javobni belgilang">
                  {q.choices.map((choice, ci) => (
                    <div key={ci} className={`qe-choice${q.answer === ci ? " is-correct" : ""}`}>
                      <input type="radio" name={`ans-${q.key}`} checked={q.answer === ci} disabled={busy} aria-label={`${ci + 1}-variant to‘g‘ri`} onChange={() => patch(q.key, (x) => ({ ...x, answer: ci }))} />
                      <input aria-label={`${ci + 1}-variant`} placeholder={`${ci + 1}-variant`} maxLength={QUIZ_LIMITS.choice} value={choice} disabled={busy} onChange={(e) => patch(q.key, (x) => ({ ...x, choices: x.choices.map((c, i) => (i === ci ? e.target.value : c)) }))} />
                      <button type="button" aria-label="Variantni olib tashlash" disabled={busy || q.choices.length <= QUIZ_LIMITS.minChoices} onClick={() => patch(q.key, (x) => ({ ...x, choices: x.choices.filter((_, i) => i !== ci), answer: x.answer === ci ? 0 : x.answer > ci ? x.answer - 1 : x.answer }))}><X size={14} /></button>
                    </div>
                  ))}
                  {q.choices.length < QUIZ_LIMITS.maxChoices && (
                    <button type="button" className="qe-add-choice" disabled={busy} onClick={() => patch(q.key, (x) => ({ ...x, choices: [...x.choices, ""] }))}><Plus size={14} /> Variant qo‘shish</button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {questions.length < QUIZ_LIMITS.maxQuestions && (
            <button type="button" className="qe-add" disabled={busy} onClick={() => setQuestions((prev) => [...prev, blank()])}><Plus size={16} /> Savol qo‘shish</button>
          )}

          <fieldset className="book-editor-talk qe-sessions" disabled={busy}>
            <legend><CalendarClock size={16} /> Jonli o‘tkazish vaqtlari</legend>
            {!quiz && <p className="book-editor-talk-note">Avval viktorinani saqlang, keyin uni tahrirlab, vaqt va kirish kodi qo‘shasiz.</p>}
            {quiz && sessions.length === 0 && <p className="book-editor-talk-note">Vaqt qo‘shilmagan: viktorina faqat mustaqil rejimda yechiladi.</p>}
            {sessions.map((s) => (
              <div key={s.id} className="qe-session">
                <span><b>{formatWhen(localInput(new Date(s.startsAt)))}</b><small>{s.participants} ishtirokchi</small></span>
                <button type="button" className="qe-code" onClick={() => s.code && copyCode(s.code)} aria-label="Kodni nusxalash"><code>{s.code}</code><Copy size={14} /></button>
                <button type="button" aria-label="Vaqtni o‘chirish" onClick={() => void dropSession(s.id)}><Trash2 size={15} /></button>
              </div>
            ))}
            {quiz && (
              <>
                <DateTimeField label="Yangi vaqt" value={newWhen} onChange={setNewWhen} min={localInput(new Date())} placeholder="Yangi vaqt qo‘shish" />
                {newWhen && <button type="button" className="qe-add" onClick={() => void addSession()}><Plus size={16} /> Vaqt va kod qo‘shish</button>}
              </>
            )}
          </fieldset>

          {error && <p className="admin-error" role="alert">{error}</p>}
          <div className="book-editor-actions">
            {quiz && <button type="button" className="danger" disabled={busy} onClick={remove}><Trash2 size={16} /> O‘chirish</button>}
            <button type="button" className="ghost" disabled={busy} onClick={onClose}>Bekor qilish</button>
            <button type="submit" className="button" disabled={busy || !title.trim()}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

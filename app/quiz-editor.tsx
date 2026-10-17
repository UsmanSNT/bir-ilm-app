"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CalendarClock, ChevronLeft, Copy, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/lib/api/books-client";
import { addQuizSession, createQuiz, deleteQuiz, notifyQuizzesChanged, removeQuizSession, updateQuiz, uploadQuizImage } from "@/lib/api/quiz-client";
import { clearQuizDraft, readQuizDraft, writeQuizDraft, type QuizDraft } from "@/lib/api/quiz-draft";
import { QUIZ_IMAGE_MAX_BYTES, QUIZ_LIMITS, type Quiz } from "@/shared/contract";
import DateTimeField, { formatWhen } from "./datetime-field";
import { localInput } from "./talk-format";

type Question = { key: string; prompt: string; choices: string[]; answer: number };
type Form = { title: string; bookId: string; image: string | null; questions: Question[] };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const blank = (): Question => ({ key: crypto.randomUUID(), prompt: "", choices: ["", ""], answer: 0 });

function formFrom(quiz: Quiz | null, bookId: string | null | undefined): Form {
  return {
    title: quiz?.title ?? "",
    bookId: quiz?.bookId ?? bookId ?? "",
    image: quiz?.image ?? null,
    questions: quiz ? quiz.questions.map((q) => ({ key: crypto.randomUUID(), prompt: q.prompt, choices: [...q.choices], answer: q.answer })) : [blank()],
  };
}

const toDraft = (form: Form): QuizDraft => ({
  title: form.title,
  bookId: form.bookId,
  image: form.image,
  questions: form.questions.map(({ prompt, choices, answer }) => ({ prompt, choices, answer })),
});

function formFromDraft(draft: QuizDraft): Form {
  return {
    title: draft.title,
    bookId: draft.bookId,
    image: draft.image,
    questions: draft.questions.length
      ? draft.questions.map((q) => ({ key: crypto.randomUUID(), prompt: String(q.prompt ?? ""), choices: [...q.choices], answer: q.answer }))
      : [blank()],
  };
}

/**
 * Viktorina yaratish va tahrirlash — alohida sahifa (modal emas).
 * Forma o'zgarganda brauzerda qoralama saqlanadi: sahifadan chiqib qaytilsa, tuzish davom etadi.
 * Viktorina saqlanganda yoki qoralama tozalanganda qoralama o'chadi.
 */
export default function QuizEditor({ quiz, bookId, onClose }: { quiz: Quiz | null; /** Yangi viktorina uchun oldindan tanlangan kitob. */ bookId?: string | null; onClose: () => void }) {
  const catalog = useCatalog();
  const draftKey = quiz?.id ?? "new";
  const [initial] = useState(() => {
    const draft = readQuizDraft(draftKey);
    return draft ? { form: formFromDraft(draft), restored: true } : { form: formFrom(quiz, bookId), restored: false };
  });
  const [form, setForm] = useState<Form>(initial.form);
  const [restored, setRestored] = useState(initial.restored);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // Jonli vaqtlar: har birining o'z kirish kodi bor. Ro'yxat serverdan kelgan javob bilan yangilanadi.
  const [sessions, setSessions] = useState(quiz?.sessions ?? []);
  const [newWhen, setNewWhen] = useState("");

  // Qoralama faqat foydalanuvchi o'zgartirgandan keyin yoziladi (ochilganda eski holatni ustiga yozmaslik uchun).
  const edited = useRef(false);
  useEffect(() => {
    if (edited.current) writeQuizDraft(draftKey, toDraft(form));
  }, [form, draftKey]);

  const update = (change: (f: Form) => Form) => {
    edited.current = true;
    setForm(change);
  };

  function discardDraft() {
    if (!window.confirm("Saqlanmagan o‘zgarishlar o‘chirilsinmi?")) return;
    clearQuizDraft(draftKey);
    edited.current = false;
    setForm(formFrom(quiz, bookId));
    setRestored(false);
  }

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

  async function pickImage(file: File) {
    if (!IMAGE_TYPES.includes(file.type)) return setError("Faqat JPG, PNG yoki WebP rasm yuklang.");
    if (file.size > QUIZ_IMAGE_MAX_BYTES) return setError(`Rasm ${QUIZ_IMAGE_MAX_BYTES / 1024 / 1024} MB dan oshmasin.`);
    setUploading(true);
    setError("");
    try {
      const url = await uploadQuizImage(file);
      update((f) => ({ ...f, image: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rasm yuklanmadi.");
    } finally {
      setUploading(false);
    }
  }

  const patch = (key: string, change: (q: Question) => Question) => update((f) => ({ ...f, questions: f.questions.map((q) => (q.key === key ? change(q) : q)) }));
  const move = (index: number, dir: -1 | 1) =>
    update((f) => {
      const target = index + dir;
      if (target < 0 || target >= f.questions.length) return f;
      const next = [...f.questions];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...f, questions: next };
    });

  function pickBook(id: string) {
    // Nom bo'sh bo'lsa, kitob nomi taklif qilinadi.
    const found = catalog.items.find((b) => b.id === id);
    update((f) => ({ ...f, bookId: id, title: found && !f.title.trim() ? found.title : f.title }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const input = {
      title: form.title.trim(),
      bookId: form.bookId || null,
      image: form.image,
      questions: form.questions.map((q) => ({ prompt: q.prompt.trim(), choices: q.choices.map((c) => c.trim()), answer: q.answer })),
    };
    try {
      if (quiz) await updateQuiz(quiz.id, input);
      else await createQuiz(input);
      clearQuizDraft(draftKey);
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
      clearQuizDraft(draftKey);
      notifyQuizzesChanged();
      toast.success("Viktorina o‘chirildi.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "O‘chirilmadi.");
      setBusy(false);
    }
  }

  return (
    <section className="quiz-editor-page quiz-editor" aria-labelledby="quiz-editor-title">
      <header className="qe-head">
        <button type="button" className="qe-back" aria-label="Orqaga" disabled={busy} onClick={onClose}><ChevronLeft size={20} /></button>
        <h2 id="quiz-editor-title">{quiz ? "Viktorinani tahrirlash" : "Yangi viktorina"}</h2>
      </header>

      <form onSubmit={save}>
        {restored && (
          <p className="qe-draft-note" role="status">
            Saqlanmagan qoralama tiklandi.{" "}
            <button type="button" onClick={discardDraft} disabled={busy}>Qoralamani tozalash</button>
          </p>
        )}

        <div className="qe-cover">
          {form.image ? <img src={form.image} alt="" /> : <span className="qe-cover-empty"><ImagePlus size={22} /> Muqova rasmi yo‘q</span>}
          <div className="qe-cover-actions">
            <label className="qe-add qe-upload">
              {uploading ? "Yuklanmoqda…" : form.image ? "Rasmni almashtirish" : "Rasm yuklash"}
              <input
                type="file"
                accept={IMAGE_TYPES.join(",")}
                hidden
                disabled={busy || uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void pickImage(file);
                }}
              />
            </label>
            {form.image && <button type="button" className="qe-add qe-remove" disabled={busy || uploading} onClick={() => update((f) => ({ ...f, image: null }))}>Olib tashlash</button>}
          </div>
        </div>

        <label className="qe-field">
          <span>Kitob</span>
          <select value={form.bookId} disabled={busy} onChange={(e) => pickBook(e.target.value)} aria-label="Kitob">
            <option value="">Kitobsiz (umumiy)</option>
            {catalog.items.map((b) => <option key={b.id} value={b.id}>{b.title} — {b.author}</option>)}
          </select>
        </label>
        <input aria-label="Viktorina nomi" placeholder="Viktorina nomi" maxLength={QUIZ_LIMITS.title} value={form.title} disabled={busy} onChange={(e) => update((f) => ({ ...f, title: e.target.value }))} required />

        <ol className="qe-list">
          {form.questions.map((q, index) => (
            <li key={q.key} className="qe-q">
              <div className="qe-q-head">
                <b>{index + 1}-savol</b>
                <span>
                  <button type="button" aria-label="Yuqoriga" disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
                  <button type="button" aria-label="Pastga" disabled={busy || index === form.questions.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
                  <button type="button" aria-label="Savolni o‘chirish" disabled={busy || form.questions.length === 1} onClick={() => update((f) => ({ ...f, questions: f.questions.filter((x) => x.key !== q.key) }))}><Trash2 size={15} /></button>
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
        {form.questions.length < QUIZ_LIMITS.maxQuestions && (
          <button type="button" className="qe-add" disabled={busy} onClick={() => update((f) => ({ ...f, questions: [...f.questions, blank()] }))}><Plus size={16} /> Savol qo‘shish</button>
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
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>Orqaga</button>
          <button type="submit" className="button" disabled={busy || uploading || !form.title.trim()}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
        </div>
      </form>
    </section>
  );
}

"use client";

import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { useCatalog } from "@/lib/api/books-client";
import { useQuizzes } from "@/lib/api/quiz-client";
import type { Quiz } from "@/shared/contract";
import QuizEditor from "./quiz-editor";

/** Admin/moderator: viktorinalar ro'yxati — yangisini qo'shish va mavjudini tahrirlash. */
export default function AdminQuizzes() {
  const { items, loading } = useQuizzes();
  const catalog = useCatalog();
  const [editing, setEditing] = useState<{ quiz: Quiz | null } | null>(null);
  const bookTitle = (id: string | null) => (id ? catalog.items.find((b) => b.id === id)?.title ?? "Kitob o‘chirilgan" : "Kitobsiz");

  return (
    <div className="admin-panel admin-quizzes">
      <button type="button" className="admin-add-book" onClick={() => setEditing({ quiz: null })}><Plus size={17} /> Yangi viktorina</button>
      {loading && <p className="admin-empty">Yuklanmoqda…</p>}
      {!loading && items.length === 0 && <p className="admin-empty">Hozircha viktorina yo‘q.</p>}
      {items.map((quiz) => (
        <button key={quiz.id} type="button" className="aq-row" onClick={() => setEditing({ quiz })}>
          <span><strong>{quiz.title}</strong><small>{bookTitle(quiz.bookId)} · {quiz.questions.length} savol</small></span>
          <ChevronRight size={18} />
        </button>
      ))}
      {editing && <QuizEditor key={editing.quiz?.id ?? "new"} quiz={editing.quiz} onClose={() => setEditing(null)} />}
    </div>
  );
}

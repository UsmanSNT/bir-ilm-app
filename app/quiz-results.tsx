"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchQuizResults } from "@/lib/api/quiz-client";
import type { QuizRankRow, QuizResultsHistory } from "@/shared/contract";
import "./quiz-results.css";

const dateTime = new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium", timeStyle: "short" });

function Board({ rows }: { rows: QuizRankRow[] }) {
  return (
    <ol className="qr-board">
      {rows.map((row) => (
        <li key={row.userId}>
          <span className="qr-rank">{row.rank}</span>
          <span className="qr-name">{row.name}</span>
          <span className="qr-score">{row.score} ball</span>
          <span className="qr-correct">{row.correct}/{row.total}</span>
        </li>
      ))}
    </ol>
  );
}

/** Viktorina bo'yicha natijalar: har bir jonli sessiya (o'rinlar bilan) va mustaqil eng yaxshi natijalar. */
export function QuizResultsDialog({
  quizId,
  title,
  open,
  onOpenChange,
}: {
  quizId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<QuizResultsHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setData(null);
    setError(null);
    fetchQuizResults(quizId)
      .then((result) => { if (alive) setData(result); })
      .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : "Natijalarni yuklab bo‘lmadi."); });
    return () => { alive = false; };
  }, [open, quizId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="qr-sheet">
        <DialogTitle>Natijalar</DialogTitle>
        <DialogDescription>{title}</DialogDescription>
        {error && <p role="alert" className="qr-empty">{error}</p>}
        {!data && !error && <p className="qr-empty">Yuklanmoqda…</p>}
        {data && data.sessions.length === 0 && data.solo.length === 0 && <p className="qr-empty">Hali natija yo‘q.</p>}
        {data?.sessions.map((session) => (
          <section key={session.sessionId} className="qr-section">
            <h3>{dateTime.format(new Date(session.startsAt))} · {session.participants} ishtirokchi</h3>
            <Board rows={session.rows} />
          </section>
        ))}
        {data && data.solo.length > 0 && (
          <section className="qr-section">
            <h3>Mustaqil (eng yaxshi natija)</h3>
            <Board rows={data.solo} />
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type Session = { sessionId: string; minutes: number };
export type TimerState = { minutes: number; remaining: number; endAt: number | null; sessionId: string; pending: Session[]; phase?: "focus" | "break"; workMinutes?: number };

export function finishPhase(state: TimerState): { next: TimerState; completed?: Session } {
  const workMinutes = state.workMinutes ?? state.minutes;
  if (state.phase === "break") {
    return { next: { ...state, phase: "focus", minutes: workMinutes, remaining: workMinutes * 60, endAt: null, sessionId: "" } };
  }
  const completed = { sessionId: state.sessionId, minutes: state.minutes };
  return { completed, next: { ...state, phase: "break", workMinutes, minutes: 5, remaining: 300, endAt: null, sessionId: "", pending: [...state.pending, completed] } };
}

"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { MessageCircle } from "lucide-react";
import UzRobot from "./uz-robot";

const EDGE = 8;
/** Sudralgan deb hisoblash uchun minimal masofa (px): oddiy bosish sudrash bo'lib ketmasin. */
const THRESHOLD = 6;

type Pos = { x: number; y: number };

function readPos(key: string): Pos | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as Pos | null;
    return raw && Number.isFinite(raw.x) && Number.isFinite(raw.y) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Har bir tugma o'zi mustaqil sudraladi (joyi alohida eslab qolinadi). Sudrash window darajasida
 * kuzatiladi — barmoq tugmadan chiqib ketsa ham harakat yo'qolmaydi; oddiy bosish tugmaning o'z click'i bilan ishlaydi.
 */
function Fab({ id, className, label, onClick, children }: { id: string; className: string; label: string; onClick: () => void; children: React.ReactNode }) {
  const storageKey = `bir-store-fab-${id}`;
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const suppress = useRef(false);

  const clamp = (p: Pos): Pos => {
    const r = ref.current?.getBoundingClientRect();
    const w = r?.width ?? 54;
    const h = r?.height ?? 54;
    return { x: Math.min(Math.max(EDGE, p.x), window.innerWidth - w - EDGE), y: Math.min(Math.max(EDGE, p.y), window.innerHeight - h - EDGE) };
  };

  useEffect(() => {
    queueMicrotask(() => { const saved = readPos(storageKey); if (saved) setPos(clamp(saved)); });
    const onResize = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const r = ref.current!.getBoundingClientRect();
    const d = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moving: false };
    const onMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      const dx = ev.clientX - d.sx;
      const dy = ev.clientY - d.sy;
      if (!d.moving && Math.hypot(dx, dy) < THRESHOLD) return;
      d.moving = true;
      setPos(clamp({ x: d.ox + dx, y: d.oy + dy }));
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (!d.moving) return;
      suppress.current = true;
      setTimeout(() => { suppress.current = false; }, 0);
      const box = ref.current?.getBoundingClientRect();
      if (box) try { localStorage.setItem(storageKey, JSON.stringify({ x: box.left, y: box.top })); } catch { /* shaxsiy rejim */ }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const style: CSSProperties | undefined = pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined;
  return (
    <button
      ref={ref}
      type="button"
      className={`store-fab ${className}`}
      style={style}
      onPointerDown={onPointerDown}
      onClickCapture={(e) => { if (suppress.current) { e.stopPropagation(); e.preventDefault(); } }}
      onClick={onClick}
      aria-label={label}
      title={`${label} (sudrab ko‘chirish mumkin)`}
    >
      {children}
    </button>
  );
}

/**
 * Do'kondagi ikkita yordamchi tugma: AI yordamchi (robot) va Adminga yozish. Ustma-ust turadi,
 * har biri alohida sudrab ko'chiriladi — orqasidagi kitob yoki matnni yopib qo'ymaydi.
 */
export default function StoreFabs({ showAi, showChat, unread, onAi, onChat }: {
  showAi: boolean;
  showChat: boolean;
  unread: number;
  onAi: () => void;
  onChat: () => void;
}) {
  return (
    <>
      {showAi && <Fab id="ai" className="is-ai" label="AI yordamchi" onClick={onAi}><UzRobot size={36} /></Fab>}
      {showChat && (
        <Fab id="chat" className="is-chat" label={unread ? `Adminga yozish, ${unread} ta yangi javob` : "Adminga yozish"} onClick={onChat}>
          <MessageCircle size={23} aria-hidden="true" />
          {unread > 0 && <b>{unread}</b>}
        </Fab>
      )}
    </>
  );
}

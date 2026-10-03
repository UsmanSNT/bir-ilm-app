"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Bot, MessageCircle } from "lucide-react";

const KEY = "bir-store-fabs";
const EDGE = 8;
/** Sudralgan deb hisoblash uchun minimal masofa (px): oddiy bosish sudrash bo'lib ketmasin. */
const THRESHOLD = 6;

type Pos = { x: number; y: number };

function readPos(): Pos | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Pos | null;
    return raw && Number.isFinite(raw.x) && Number.isFinite(raw.y) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Do'kondagi ikkita yordamchi tugma: AI yordamchi (robot) va Admin bilan chat.
 * Qotib qolmaydi — barmoq/sichqoncha bilan istalgan joyga sudrab qo'yiladi (joy eslab qolinadi),
 * shunda tugma ostidagi kitob yoki matnni yopib qo'ymaydi.
 */
export default function StoreFabs({ showAi, showChat, unread, onAi, onChat }: {
  showAi: boolean;
  showChat: boolean;
  unread: number;
  onAi: () => void;
  onChat: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const suppress = useRef(false);

  const clamp = (p: Pos): Pos => {
    const r = box.current?.getBoundingClientRect();
    const w = r?.width ?? 120;
    const h = r?.height ?? 56;
    return { x: Math.min(Math.max(EDGE, p.x), window.innerWidth - w - EDGE), y: Math.min(Math.max(EDGE, p.y), window.innerHeight - h - EDGE) };
  };

  useEffect(() => {
    queueMicrotask(() => { const saved = readPos(); if (saved) setPos(clamp(saved)); });
    const onResize = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!showAi && !showChat) return null;

  // Sudrash window darajasida kuzatiladi: barmoq tugmadan chiqib ketsa ham harakat yo'qolmaydi,
  // oddiy bosish esa tugmaning o'z click hodisasi bilan ishlaydi (pointer capture ishlatilmaydi).
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const r = box.current!.getBoundingClientRect();
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
      const box2 = box.current?.getBoundingClientRect();
      if (box2) try { localStorage.setItem(KEY, JSON.stringify({ x: box2.left, y: box2.top })); } catch { /* shaxsiy rejim */ }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      ref={box}
      className="store-fabs"
      style={pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined}
      onPointerDown={down}
      onClickCapture={(e) => { if (suppress.current) { e.stopPropagation(); e.preventDefault(); } }}
      role="group"
      aria-label="Yordamchi tugmalar (sudrab ko‘chirish mumkin)"
    >
      {showAi && <button type="button" className="store-fab is-ai" onClick={onAi} aria-label="AI yordamchi" title="AI yordamchi"><Bot size={24} aria-hidden="true" /></button>}
      {showChat && (
        <button type="button" className="store-fab is-chat" onClick={onChat} aria-label={unread ? `Adminga yozish, ${unread} ta yangi javob` : "Adminga yozish"} title="Adminga yozish">
          <MessageCircle size={23} aria-hidden="true" />
          {unread > 0 && <b>{unread}</b>}
        </button>
      )}
    </div>
  );
}

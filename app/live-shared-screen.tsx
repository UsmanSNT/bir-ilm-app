"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Maximize2, Minimize2, MonitorUp, ZoomIn, ZoomOut } from "lucide-react";
import type { Track } from "livekit-client";
import { Avatar } from "./live-avatar";

/** Kattalashtirish bosqichlari: 1× — butun ekran sig'adi, 4× — 1080p manbaning har pikseli ko'rinadi. */
const ZOOMS = [1, 2, 3, 4] as const;
const DEFAULT_RATIO = 16 / 9;
/** Nom belgisi va tugmalar tasvir ustida turadi; shuncha vaqt tegilmasa yashirinadi (yuqori qator ochiladi). */
const OVERLAY_IDLE_MS = 3000;

type OrientationLockApi = { lock?: (orientation: "landscape") => Promise<void> };

/** Telefonda keng ekran gorizontal holatda to'liq sig'adi; ruxsat berilmasa yoki qo'llanmasa, jim o'tadi. */
function lockLandscape(): void {
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  (screen.orientation as ScreenOrientation & OrientationLockApi | undefined)?.lock?.("landscape")?.catch(() => {});
}

/**
 * Ulashilgan ekran. Oddiy holatda butun tasvir sig'adigan qilib joylashadi; kattalashtirish tugmalari va to'liq
 * ekran rejimi mayda matnni o'qishga imkon beradi. To'liq ekran brauzerning Fullscreen API orqali ochiladi,
 * iPhone kabi qo'llamaydigan qurilmalarda esa sahifa ustini to'ldiruvchi oddiy kattalashtirish ishlatiladi.
 * Ulashuvchi nomi va tugmalar tasvir ustida turadi — alohida qator joy olmaydi.
 */
export default function SharedScreen({ track, sharerName }: { track: Track; sharerName: string | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [zoomStep, setZoomStep] = useState(0);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const expanded = nativeFullscreen || cssFullscreen;
  const zoom = ZOOMS[zoomStep];
  // Kattalashtirishda ko'rinib turgan markaz o'z joyida qolishi uchun: scroll markazining nisbati (0..1).
  const keepCenter = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Tugmalarni ko'rsatadi va yashirish hisoblagichini qaytadan boshlaydi. */
  function wake() {
    clearTimeout(idleTimer.current);
    setIdle(false);
    idleTimer.current = setTimeout(() => setIdle(true), OVERLAY_IDLE_MS);
  }

  useEffect(() => {
    idleTimer.current = setTimeout(() => setIdle(true), OVERLAY_IDLE_MS);
    return () => clearTimeout(idleTimer.current);
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    track.attach(el);
    const measure = () => {
      if (el.videoWidth > 0 && el.videoHeight > 0) setRatio(el.videoWidth / el.videoHeight);
    };
    el.addEventListener("loadedmetadata", measure);
    el.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("loadedmetadata", measure);
      el.removeEventListener("resize", measure);
      track.detach(el);
    };
  }, [track]);

  useEffect(() => {
    const sync = () => setNativeFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    if (!cssFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCssFullscreen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cssFullscreen]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    const center = keepCenter.current;
    if (!view || !center) return;
    keepCenter.current = null;
    view.scrollLeft = center.x * view.scrollWidth - view.clientWidth / 2;
    view.scrollTop = center.y * view.scrollHeight - view.clientHeight / 2;
  }, [zoomStep]);

  function changeZoom(next: number) {
    const view = viewRef.current;
    if (view) {
      keepCenter.current = {
        x: (view.scrollLeft + view.clientWidth / 2) / view.scrollWidth,
        y: (view.scrollTop + view.clientHeight / 2) / view.scrollHeight,
      };
    }
    setZoomStep(Math.min(ZOOMS.length - 1, Math.max(0, next)));
  }

  async function toggleExpanded() {
    const root = rootRef.current;
    if (!root) return;
    if (expanded) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setCssFullscreen(false);
      return;
    }
    if (typeof root.requestFullscreen === "function") {
      try {
        await root.requestFullscreen({ navigationUI: "hide" });
        if (ratio > 1) lockLandscape();
        return;
      } catch {
        // Brauzer rad etdi — oddiy kattalashtirishga o'tamiz.
      }
    }
    setCssFullscreen(true);
  }

  // Sichqoncha bilan kattalashgan tasvirni sudrab siljitish; sensorli ekranda oddiy surish ishlaydi.
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const view = viewRef.current;
    if (e.pointerType !== "mouse" || e.button !== 0 || zoom === 1 || !view) return;
    drag.current = { x: e.clientX, y: e.clientY, left: view.scrollLeft, top: view.scrollTop };
    view.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const view = viewRef.current;
    const start = drag.current;
    if (!view || !start) return;
    view.scrollLeft = start.left - (e.clientX - start.x);
    view.scrollTop = start.top - (e.clientY - start.y);
  }
  function onPointerEnd() {
    drag.current = null;
  }

  const style = { "--ratio": ratio, "--zoom": zoom } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`live-shared-screen${cssFullscreen ? " is-expanded" : ""}${idle ? " is-idle" : ""}`}
      data-zoomed={zoom > 1 ? "" : undefined}
      onPointerMove={wake}
      onPointerDown={wake}
      onFocus={wake}
    >
      <div
        ref={viewRef}
        className="live-shared-view"
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={() => void toggleExpanded()}
      >
        <video ref={videoRef} className="live-shared-video" autoPlay playsInline muted />
      </div>

      <div className="live-share-badge" title={sharerName ? `${sharerName} ekranini ulashmoqda` : undefined}>
        <MonitorUp size={14} aria-hidden="true" />
        {sharerName && <Avatar name={sharerName} />}
        <span>{sharerName ? `${sharerName} ekranini ulashmoqda` : "Ekran ulashilmoqda"}</span>
      </div>

      <div className="live-share-tools" role="toolbar" aria-label="Ulashilgan ekran">
        <button type="button" aria-label="Kichraytirish" title="Kichraytirish" disabled={zoomStep === 0} onClick={() => changeZoom(zoomStep - 1)}>
          <ZoomOut size={16} aria-hidden="true" />
        </button>
        <output aria-live="polite">{zoom}×</output>
        <button type="button" aria-label="Kattalashtirish" title="Kattalashtirish" disabled={zoomStep === ZOOMS.length - 1} onClick={() => changeZoom(zoomStep + 1)}>
          <ZoomIn size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={expanded ? "To‘liq ekrandan chiqish" : "To‘liq ekran"}
          title={expanded ? "To‘liq ekrandan chiqish" : "To‘liq ekran"}
          onClick={() => void toggleExpanded()}
        >
          {expanded ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

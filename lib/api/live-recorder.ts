/**
 * Jonli suhbatni yozib olish — adminning brauzerida.
 *
 * LiveKit'ning serverdagi yozib olish xizmati (Egress) uy serverida yo'q, shuning uchun
 * xonadagi barcha ovozlar (o'zining mikrofoni + boshqalar) Web Audio orqali bitta oqimga
 * qo'shiladi va MediaRecorder har 10 soniyada bo'lak beradi. Bo'laklar serverga ketma-ket
 * yuboriladi: brauzer yopilib qolsa ham oxirgi ~10 soniyagacha yozuv saqlanib qoladi.
 * Yozuvni pauza qilish va to'xtagan joydan davom ettirish mumkin; to'xtatilgach admin
 * uning nusxasini o'zi tanlagan faylga saqlay oladi (bo'laklar brauzer xotirasida ham turadi).
 */
"use client";

import { RoomEvent, Track, type Room } from "livekit-client";
import type { LiveRecording } from "@/shared/contract/live";
import { API_PREFIX } from "./config";

const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const SLICE_MS = 10_000;

export function recordingSupported(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && typeof AudioContext !== "undefined";
}

function pickType(): string | null {
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RoomRecorder {
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private sources = new Map<MediaStreamTrack, MediaStreamAudioSourceNode>();
  private recorder: MediaRecorder | null = null;
  private queue: Blob[] = [];
  /** Mahalliy nusxa (faylga saqlash uchun): ~28 MB / soat. */
  private chunks: Blob[] = [];
  private pausedAt = 0;
  private pausedTotal = 0;
  private mime = "";
  private pumping: Promise<void> | null = null;
  private offset = 0;
  private startedAt = 0;
  private recordingId = "";
  private readonly sync = () => this.connectTracks();

  constructor(
    private readonly room: Room,
    private readonly sessionId: string,
    private readonly onError: (message: string) => void,
  ) {}

  async start(): Promise<void> {
    const type = pickType();
    if (!type) throw new Error("Bu brauzer yozib olishni qo'llab-quvvatlamaydi.");
    this.mime = type;

    const res = await fetch(`${API_PREFIX}/live/${encodeURIComponent(this.sessionId)}/recordings`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mime: type }),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: LiveRecording; error?: { message?: string } };
    if (!res.ok || !body.data) throw new Error(body.error?.message ?? "Yozuvni boshlab bo'lmadi.");
    this.recordingId = body.data.id;

    this.ctx = new AudioContext();
    await this.ctx.resume().catch(() => {});
    this.dest = this.ctx.createMediaStreamDestination();
    this.connectTracks();
    this.room
      .on(RoomEvent.TrackSubscribed, this.sync)
      .on(RoomEvent.TrackUnsubscribed, this.sync)
      .on(RoomEvent.LocalTrackPublished, this.sync)
      .on(RoomEvent.LocalTrackUnpublished, this.sync);

    this.recorder = new MediaRecorder(this.dest.stream, { mimeType: type, audioBitsPerSecond: 64_000 });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size) {
        this.chunks.push(event.data);
        this.queue.push(event.data);
        this.pump();
      }
    };
    this.startedAt = Date.now();
    this.recorder.start(SLICE_MS);
  }

  get paused(): boolean {
    return this.recorder?.state === "paused";
  }

  /** Pauzalarsiz o'tgan vaqt (ms). */
  elapsed(now = Date.now()): number {
    if (!this.startedAt) return 0;
    return now - this.startedAt - this.pausedTotal - (this.pausedAt ? now - this.pausedAt : 0);
  }

  pause(): void {
    if (this.recorder?.state !== "recording") return;
    this.recorder.pause();
    this.pausedAt = Date.now();
  }

  /** To'xtagan joydan davom: o'sha faylga qo'shiladi. */
  resume(): void {
    if (this.recorder?.state !== "paused") return;
    this.recorder.resume();
    this.pausedTotal += Date.now() - this.pausedAt;
    this.pausedAt = 0;
  }

  /** To'xtatilgandan keyin: butun yozuv bitta fayl sifatida. */
  file(): { blob: Blob; extension: string } {
    const extension = this.mime.includes("mp4") ? "m4a" : this.mime.includes("ogg") ? "ogg" : "webm";
    return { blob: new Blob(this.chunks, { type: this.mime.split(";")[0] || "audio/webm" }), extension };
  }

  /** Yozuvni to'xtatadi va oxirgi bo'laklar serverga yetib borguncha kutadi. */
  async stop(): Promise<void> {
    if (this.pausedAt) this.resume();
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    this.room
      .off(RoomEvent.TrackSubscribed, this.sync)
      .off(RoomEvent.TrackUnsubscribed, this.sync)
      .off(RoomEvent.LocalTrackPublished, this.sync)
      .off(RoomEvent.LocalTrackUnpublished, this.sync);
    // Oxirgi bo'lak ondataavailable'dan keyin navbatga tushadi.
    await wait(0);
    await Promise.race([this.pump(), wait(30_000)]);
    this.sources.forEach((node) => node.disconnect());
    this.sources.clear();
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  /** Xonadagi hamma ovoz treklarini aralashtirgichga ulaydi, chiqib ketganlarini uzadi. */
  private connectTracks() {
    if (!this.ctx || !this.dest) return;
    const live = new Set<MediaStreamTrack>();
    const participants = [this.room.localParticipant, ...this.room.remoteParticipants.values()];
    for (const p of participants) {
      for (const pub of p.trackPublications.values()) {
        const track = pub.track?.mediaStreamTrack;
        if (pub.kind === Track.Kind.Audio && track && track.readyState === "live") live.add(track);
      }
    }
    for (const track of live) {
      if (this.sources.has(track)) continue;
      const node = this.ctx.createMediaStreamSource(new MediaStream([track]));
      node.connect(this.dest);
      this.sources.set(track, node);
    }
    for (const [track, node] of this.sources) {
      if (!live.has(track)) {
        node.disconnect();
        this.sources.delete(track);
      }
    }
  }

  /** Navbatdagi bo'laklarni tartib bilan yuboradi; tarmoq uzilsa qayta urinadi. */
  private pump(): Promise<void> {
    if (this.pumping) return this.pumping;
    this.pumping = (async () => {
      let failures = 0;
      while (this.queue.length) {
        const blob = this.queue[0];
        try {
          const res = await fetch(
            `${API_PREFIX}/live/${encodeURIComponent(this.sessionId)}/recordings/${this.recordingId}`,
            {
              method: "PUT",
              credentials: "include",
              body: blob,
              headers: {
                "Content-Type": "application/octet-stream",
                "X-Upload-Offset": String(this.offset),
                "X-Recording-Seconds": String(Math.round(this.elapsed() / 1000)),
              },
            },
          );
          const body = (await res.json().catch(() => ({}))) as {
            data?: { received: number };
            error?: { message?: string; fields?: { received?: string[] } };
          };
          if (res.status === 409 && body.error?.fields?.received) {
            this.offset = Number(body.error.fields.received[0]);
            continue;
          }
          if (!res.ok || !body.data) throw new Error(body.error?.message ?? "Yozuv bo'lagi saqlanmadi.");
          this.offset = body.data.received;
          this.queue.shift();
          failures = 0;
        } catch (error) {
          failures += 1;
          if (failures === 3) this.onError("Yozuv serverga yetib bormayapti — internet tiklanishi bilan davom etadi.");
          await wait(Math.min(15_000, 1500 * failures));
          if (failures > 40) {
            this.onError(error instanceof Error ? error.message : "Yozuv saqlanmadi.");
            return;
          }
        }
      }
    })().finally(() => {
      this.pumping = null;
    });
    return this.pumping;
  }
}

type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;

/**
 * Yozuvni faylga saqlash: brauzer qo'llasa — tizimning «Saqlash» oynasi (papka va nomni admin tanlaydi),
 * aks holda ko'rsatilgan nom bilan yuklab olinadi. Bekor qilinsa false.
 */
export async function saveRecordingFile(blob: Blob, name: string, extension: string): Promise<boolean> {
  const clean = name.trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "Bir-Ilm-suhbat";
  const fileName = clean.toLowerCase().endsWith(`.${extension}`) ? clean : `${clean}.${extension}`;
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: fileName, types: [{ description: "Audio yozuv", accept: { [blob.type || "audio/webm"]: [`.${extension}`] } }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      // Boshqa xato (ruxsat, iframe) — oddiy yuklab olishga o'tamiz.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/**
 * Jonli suhbatni yozib olish — adminning brauzerida.
 *
 * LiveKit'ning serverdagi yozib olish xizmati (Egress) uy serverida yo'q, shuning uchun xonadagi
 * barcha ovozlar (o'zining mikrofoni + boshqalar) Web Audio orqali bitta oqimga qo'shiladi,
 * AudioWorklet xom ovozni oladi va MP3 (128 kbit/s, mono) ga kodlanadi. MP3 har qanday qurilmada
 * (Windows, telefon, brauzer) ijro etiladi va davomiyligi to'g'ri ko'rinadi — oldingi WebM/Opus
 * yozuvlarida ikkalasi ham yo'q edi. Kodlangan ma'lumot har ~10 soniyada serverga ketma-ket yuboriladi:
 * brauzer yopilib qolsa ham oxirgi ~10 soniyagacha yozuv saqlanadi. Yozuvni pauza qilish va
 * to'xtagan joydan davom ettirish mumkin; to'xtatilgach admin nusxasini faylga saqlay oladi.
 */
"use client";

import { RoomEvent, Track, type Room } from "livekit-client";
import { Mp3Encoder } from "@breezystack/lamejs";
import type { LiveRecording } from "@/shared/contract/live";
import { API_PREFIX } from "./config";

const SLICE_MS = 10_000;
const SAMPLE_RATE = 48_000;
const MP3_KBPS = 128;
/** Kodlagichga beriladigan blok (MP3 kadri 1152 ning karralisi). */
const ENCODE_BLOCK = 1152 * 4;

/** Ovozni asosiy oqimdan mono qilib, 128 kadrlik bo'laklarda uzatadi. */
const WORKLET_CODE = `
class BirCapture extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length) {
      const frames = input[0].length;
      const mono = new Float32Array(frames);
      for (let c = 0; c < input.length; c++) {
        const channel = input[c];
        for (let i = 0; i < frames; i++) mono[i] += channel[i] / input.length;
      }
      this.port.postMessage(mono, [mono.buffer]);
    }
    return true;
  }
}
registerProcessor("bir-capture", BirCapture);
`;

export function recordingSupported(): boolean {
  return typeof window !== "undefined" && typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined";
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RoomRecorder {
  private ctx: AudioContext | null = null;
  private mix: GainNode | null = null;
  private node: AudioWorkletNode | null = null;
  private encoder: Mp3Encoder | null = null;
  private sources = new Map<MediaStreamTrack, MediaStreamAudioSourceNode>();
  private pcm = new Int16Array(ENCODE_BLOCK);
  private pcmLength = 0;
  private encoded: Uint8Array[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private isPaused = false;
  private queue: Blob[] = [];
  /** Mahalliy nusxa (faylga saqlash uchun): ~57 MB / soat. */
  private chunks: Blob[] = [];
  private pausedAt = 0;
  private pausedTotal = 0;
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
    if (!recordingSupported()) throw new Error("Bu brauzer yozib olishni qo'llab-quvvatlamaydi.");

    const res = await fetch(`${API_PREFIX}/live/${encodeURIComponent(this.sessionId)}/recordings`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mime: "audio/mpeg" }),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: LiveRecording; error?: { message?: string } };
    if (!res.ok || !body.data) throw new Error(body.error?.message ?? "Yozuvni boshlab bo'lmadi.");
    this.recordingId = body.data.id;

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.ctx = ctx;
    await ctx.resume().catch(() => {});
    const moduleUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }

    this.encoder = new Mp3Encoder(1, ctx.sampleRate, MP3_KBPS);
    this.mix = ctx.createGain();
    this.mix.gain.value = 0.9;
    // Bir necha kishi birdan gapirsa ovoz qirqilib ketmasligi uchun yumshoq cheklagich.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    this.node = new AudioWorkletNode(ctx, "bir-capture", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: "explicit" });
    const silent = ctx.createGain();
    silent.gain.value = 0;
    this.mix.connect(limiter).connect(this.node).connect(silent).connect(ctx.destination);
    this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (this.active && !this.isPaused) this.feed(event.data);
    };

    this.connectTracks();
    this.room
      .on(RoomEvent.TrackSubscribed, this.sync)
      .on(RoomEvent.TrackUnsubscribed, this.sync)
      .on(RoomEvent.LocalTrackPublished, this.sync)
      .on(RoomEvent.LocalTrackUnpublished, this.sync);

    this.active = true;
    this.startedAt = Date.now();
    this.timer = setInterval(() => this.cut(), SLICE_MS);
  }

  get paused(): boolean {
    return this.isPaused;
  }

  /** Pauzalarsiz o'tgan vaqt (ms). */
  elapsed(now = Date.now()): number {
    if (!this.startedAt) return 0;
    return now - this.startedAt - this.pausedTotal - (this.pausedAt ? now - this.pausedAt : 0);
  }

  pause(): void {
    if (!this.active || this.isPaused) return;
    this.isPaused = true;
    this.pausedAt = Date.now();
  }

  /** To'xtagan joydan davom: o'sha faylga qo'shiladi. */
  resume(): void {
    if (!this.active || !this.isPaused) return;
    this.isPaused = false;
    this.pausedTotal += Date.now() - this.pausedAt;
    this.pausedAt = 0;
  }

  /** To'xtatilgandan keyin: butun yozuv bitta MP3 fayl sifatida. */
  file(): { blob: Blob; extension: string } {
    return { blob: new Blob(this.chunks, { type: "audio/mpeg" }), extension: "mp3" };
  }

  /** Yozuvni to'xtatadi va oxirgi bo'laklar serverga yetib borguncha kutadi. */
  async stop(): Promise<void> {
    if (this.pausedAt) this.resume();
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.room
      .off(RoomEvent.TrackSubscribed, this.sync)
      .off(RoomEvent.TrackUnsubscribed, this.sync)
      .off(RoomEvent.LocalTrackPublished, this.sync)
      .off(RoomEvent.LocalTrackUnpublished, this.sync);
    // Oxirgi to'planmagan ovozni kodlab, kodlagichni yopamiz.
    this.flushPcm();
    const tail = this.encoder?.flush();
    if (tail?.length) this.encoded.push(new Uint8Array(tail));
    this.cut();
    await Promise.race([this.pump(), wait(30_000)]);
    this.sources.forEach((node) => node.disconnect());
    this.sources.clear();
    this.node?.port.close();
    this.node?.disconnect();
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.encoder = null;
  }

  /** Worklet'dan kelgan float ovozni 16 bitga o'tkazib, bloklab kodlaydi. */
  private feed(samples: Float32Array) {
    for (let i = 0; i < samples.length; i++) {
      const v = Math.max(-1, Math.min(1, samples[i]));
      this.pcm[this.pcmLength++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.pcmLength === ENCODE_BLOCK) this.flushPcm();
    }
  }

  private flushPcm() {
    if (!this.encoder || !this.pcmLength) return;
    const out = this.encoder.encodeBuffer(this.pcm.subarray(0, this.pcmLength));
    this.pcmLength = 0;
    if (out.length) this.encoded.push(new Uint8Array(out));
  }

  /** Shu paytgacha kodlangan MP3 ma'lumotni bitta bo'lak qilib yuborish navbatiga qo'yadi. */
  private cut() {
    if (!this.encoded.length) return;
    const blob = new Blob(this.encoded as BlobPart[], { type: "audio/mpeg" });
    this.encoded = [];
    this.chunks.push(blob);
    this.queue.push(blob);
    void this.pump();
  }

  /** Xonadagi hamma ovoz treklarini aralashtirgichga ulaydi, chiqib ketganlarini uzadi. */
  private connectTracks() {
    if (!this.ctx || !this.mix) return;
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
      node.connect(this.mix);
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

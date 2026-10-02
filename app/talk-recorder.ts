"use client";

/**
 * Efirni ovozli yozib olish (moderator qurilmasida).
 * Barcha ovozlar (o'z mikrofoni + boshqalar) Web Audio orqali bitta oqimga aralashtiriladi va
 * MediaRecorder bilan Opus (~48 kbit/s, soatiga ~22 MB) faylga yoziladi. Pauza va davom ettirish mumkin.
 */
export class TalkRecorder {
  private ctx = new AudioContext();
  private dest = this.ctx.createMediaStreamDestination();
  private sources = new Map<MediaStream, MediaStreamAudioSourceNode>();
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private pausedTotal = 0;
  private pausedAt = 0;
  readonly mimeType: string;

  constructor() {
    // Nutq uchun mono yetarli — fayl hajmi kichikroq.
    this.dest.channelCount = 1;
    const types = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];
    this.mimeType = types.find(t => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
    this.recorder = new MediaRecorder(this.dest.stream, { mimeType: this.mimeType || undefined, audioBitsPerSecond: 48_000 });
    this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
  }

  /** Yozuvga ovoz manbalarini moslash (yangi gapiruvchi qo'shilsa ulanadi, chiqqanniki uziladi). */
  setStreams(streams: MediaStream[]) {
    for (const [stream, node] of this.sources) if (!streams.includes(stream)) { node.disconnect(); this.sources.delete(stream); }
    for (const stream of streams) {
      if (this.sources.has(stream) || !stream.getAudioTracks().length) continue;
      const node = this.ctx.createMediaStreamSource(stream);
      node.connect(this.dest);
      this.sources.set(stream, node);
    }
  }

  get state() { return this.recorder.state; }

  /** Pauzalarsiz o'tgan vaqt (ms). */
  elapsed(now = Date.now()) {
    if (!this.startedAt) return 0;
    return now - this.startedAt - this.pausedTotal - (this.pausedAt ? now - this.pausedAt : 0);
  }

  start() {
    void this.ctx.resume();
    this.recorder.start(1000);
    this.startedAt = Date.now();
  }

  pause() {
    if (this.recorder.state !== "recording") return;
    this.recorder.pause();
    this.pausedAt = Date.now();
  }

  resume() {
    if (this.recorder.state !== "paused") return;
    this.recorder.resume();
    this.pausedTotal += Date.now() - this.pausedAt;
    this.pausedAt = 0;
  }

  /** Yozuvni tugatib, faylni qaytaradi. */
  stop(): Promise<Blob> {
    return new Promise(resolve => {
      this.recorder.onstop = () => {
        for (const node of this.sources.values()) node.disconnect();
        void this.ctx.close();
        resolve(new Blob(this.chunks, { type: this.mimeType || "audio/webm" }));
      };
      if (this.recorder.state === "inactive") this.recorder.onstop(new Event("stop"));
      else this.recorder.stop();
    });
  }

  get extension() {
    return this.mimeType.includes("ogg") ? "ogg" : this.mimeType.includes("mp4") ? "m4a" : "webm";
  }
}

type SavePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;

/**
 * Yozuvni saqlash: brauzer qo'llasa — tizimning "Saqlash" oynasi (papka va nomni moderator tanlaydi),
 * aks holda tanlangan nom bilan yuklab olinadi. Bekor qilinsa false.
 */
export async function saveRecording(blob: Blob, name: string, ext: string) {
  const fileName = name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: fileName, types: [{ description: "Audio yozuv", accept: { [blob.type.split(";")[0] || "audio/webm"]: [`.${ext}`] } }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

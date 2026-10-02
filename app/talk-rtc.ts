"use client";

import type { MediaKind } from "./talk-types";

/**
 * Efir uchun bitta RTCPeerConnection (Cloudflare Realtime SFU orqali).
 * - O'z treklarini bir marta yuboradi (push), boshqalarnikini faqat kerak bo'lsa oladi (pull).
 * - Barcha SDP almashinuvlari navbat bilan bajariladi (bir vaqtda ikki muzokara bo'lmasin).
 * - Kam trafik: ovoz Opus mono ~32 kbit/s, video 360p/15fps ~350 kbit/s, ekran ~8fps ~700 kbit/s.
 */
export type RemoteTrack = { userId: string; kind: MediaKind; stream: MediaStream };

const BITRATE: Record<MediaKind, RTCRtpEncodingParameters> = {
  audio: { maxBitrate: 32_000 },
  video: { maxBitrate: 350_000, maxFramerate: 15 },
  screen: { maxBitrate: 700_000, maxFramerate: 8 },
};

export class RtcError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function api<T>(op: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/talk/rtc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...body }) });
  const data = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new RtcError(data.error ?? "Ovoz serveri xatosi.", res.status);
  return data;
}

export class TalkRtc {
  private pc: RTCPeerConnection;
  private queue: Promise<unknown> = Promise.resolve();
  private local = new Map<MediaKind, { transceiver: RTCRtpTransceiver; track: MediaStreamTrack }>();
  /** mid → kim va qaysi trek (pull javobidan, ontrack'dan oldin to'ldiriladi). */
  private pulledByMid = new Map<string, { userId: string; kind: MediaKind }>();
  private remote = new Map<string, RemoteTrack & { mid: string }>();
  private closed = false;

  private constructor(iceServers: RTCIceServer[], private onChange: (remote: RemoteTrack[]) => void) {
    this.pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
    this.pc.ontrack = event => {
      const mid = event.transceiver.mid;
      const info = mid ? this.pulledByMid.get(mid) : undefined;
      if (!mid || !info) return;
      this.remote.set(`${info.userId}:${info.kind}`, { ...info, mid, stream: new MediaStream([event.track]) });
      this.emit();
    };
  }

  /** Yangi SFU sessiyasi; server ruxsat bermasa (sozlanmagan, efir yo'q) RtcError. */
  static async connect(onChange: (remote: RemoteTrack[]) => void) {
    const { iceServers } = await api<{ iceServers: RTCIceServer[] }>("session");
    return new TalkRtc(iceServers, onChange);
  }

  private emit() { if (!this.closed) this.onChange([...this.remote.values()]); }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  has(kind: MediaKind) { return this.local.has(kind); }

  /** O'z trekini SFU'ga yuborish. */
  publish(kind: MediaKind, track: MediaStreamTrack) {
    return this.run(async () => {
      if (this.closed || this.local.has(kind)) return;
      if (kind === "audio") track.contentHint = "speech";
      if (kind === "screen") track.contentHint = "detail";
      const transceiver = this.pc.addTransceiver(track, { direction: "sendonly", sendEncodings: [BITRATE[kind]] });
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      try {
        const res = await api<{ sessionDescription: RTCSessionDescriptionInit }>("push", { sdp: offer.sdp, tracks: [{ mid: transceiver.mid, kind }] });
        await this.pc.setRemoteDescription(res.sessionDescription);
        this.local.set(kind, { transceiver, track });
      } catch (e) {
        transceiver.stop();
        throw e;
      }
    });
  }

  /** Mikrofonni o'chirib-yoqish: trek qoladi (qayta muzokara yo'q), faqat jim bo'ladi — Opus DTX deyarli trafik sarflamaydi. */
  mute(kind: MediaKind, muted: boolean) {
    const t = this.local.get(kind);
    if (t) t.track.enabled = !muted;
  }

  /** O'z trekini to'xtatish (kamera/ekran o'chirildi yoki so'z olindi). */
  unpublish(kind: MediaKind) {
    return this.run(async () => {
      const t = this.local.get(kind);
      if (!t || this.closed) return;
      this.local.delete(kind);
      const mid = t.transceiver.mid;
      t.transceiver.stop();
      t.track.stop();
      if (!mid) return;
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      const res = await api<{ sessionDescription: RTCSessionDescriptionInit }>("close", { sdp: offer.sdp, mids: [mid], kinds: [kind] });
      await this.pc.setRemoteDescription(res.sessionDescription);
    });
  }

  /** Kerakli treklar ro'yxatiga moslash: yangilarini olish, keraksizlarini yopish. */
  sync(wanted: { userId: string; kind: MediaKind }[]) {
    return this.run(async () => {
      if (this.closed) return;
      const want = new Set(wanted.map(w => `${w.userId}:${w.kind}`));
      const stale = [...this.remote.values()].filter(r => !want.has(`${r.userId}:${r.kind}`));
      const pending = new Set([...this.pulledByMid.values()].map(v => `${v.userId}:${v.kind}`));
      const fresh = wanted.filter(w => !this.remote.has(`${w.userId}:${w.kind}`) && !pending.has(`${w.userId}:${w.kind}`));

      if (stale.length) {
        for (const r of stale) {
          this.remote.delete(`${r.userId}:${r.kind}`);
          this.pulledByMid.delete(r.mid);
          this.pc.getTransceivers().find(t => t.mid === r.mid)?.stop();
        }
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        const res = await api<{ sessionDescription: RTCSessionDescriptionInit }>("close", { sdp: offer.sdp, mids: stale.map(r => r.mid) });
        await this.pc.setRemoteDescription(res.sessionDescription);
        this.emit();
      }

      if (fresh.length) {
        const res = await api<{ tracks: { mid: string; userId: string; kind: MediaKind }[]; requiresImmediateRenegotiation: boolean; sessionDescription: RTCSessionDescriptionInit | null }>("pull", { tracks: fresh });
        for (const t of res.tracks) this.pulledByMid.set(t.mid, { userId: t.userId, kind: t.kind });
        if (res.requiresImmediateRenegotiation && res.sessionDescription) {
          await this.pc.setRemoteDescription(res.sessionDescription);
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          await api("renegotiate", { sdp: answer.sdp });
        }
      }
    });
  }

  close() {
    this.closed = true;
    for (const t of this.local.values()) t.track.stop();
    this.local.clear();
    this.remote.clear();
    this.pc.close();
  }
}

/** Ovozli efir uchun mikrofon sozlamalari: aks-sado, shovqin bostirish, mono. */
export const MIC_CONSTRAINTS: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
export const CAM_CONSTRAINTS: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 15 }, facingMode: "user" };

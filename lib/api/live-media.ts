/**
 * Jonli suhbatda ovoz, video va ekran ulashish (LiveKit).
 *
 * WebSocket `joined` xabari bilan kelgan token orqali ulanadi. Ruxsatlar
 * serverda: tinglovchi faqat eshitadi, so'z berilganda mikrofon ochiladi.
 */
"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
} from "livekit-client";
import type { LiveMedia } from "@/shared/contract/live";

export type MediaStatus = "off" | "connecting" | "connected" | "error";

export type ParticipantMedia = {
  camera?: Track;
  screen?: Track;
  micOn: boolean;
  speaking: boolean;
};

export type LiveMediaApi = {
  status: MediaStatus;
  canPublish: boolean;
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  /** Brauzer ovozni avtomatik ijro etishni blokladi — foydalanuvchi bosishi kerak. */
  audioBlocked: boolean;
  byUser: (userId: string) => ParticipantMedia;
  /** Hozir ekran ulashayotgan qatnashchi (bo'lsa). */
  screenSharer: { userId: string; track: Track } | null;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  startAudio: () => Promise<void>;
};

const EMPTY: ParticipantMedia = { micOn: false, speaking: false };

function trackOf(p: Participant, source: Track.Source): Track | undefined {
  const pub = p.getTrackPublication(source);
  return pub && !pub.isMuted ? pub.track : undefined;
}

function explain(error: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.mediaDevices) {
    return "Kamera, mikrofon va ekran ulashish faqat HTTPS saytda ishlaydi.";
  }
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError") return "Brauzer ruxsat bermadi. Manzil satridagi qulf belgisidan ruxsatni yoqing.";
  if (name === "NotFoundError") return "Qurilma topilmadi: kamera yoki mikrofon ulanmagan.";
  if (name === "NotReadableError") return "Qurilma band: boshqa dastur kamera yoki mikrofonni ishlatmoqda.";
  return error instanceof Error ? error.message : "Media xatosi.";
}

export function useLiveMedia(media: LiveMedia | null, onError: (message: string) => void): LiveMediaApi {
  const roomRef = useRef<Room | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<MediaStatus>("off");
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  const connected = media !== null;
  const url = media?.url;
  const token = media?.token;

  useEffect(() => {
    if (!connected || !url || !token) return;
    // Qayta ulanishda yangi token keladi, lekin mavjud media ulanish saqlanadi.
    if (roomRef.current) return;

    const host = document.createElement("div");
    host.hidden = true;
    document.body.appendChild(host);

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    setRoom(room);

    const onTrack = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) host.appendChild(track.attach());
      refresh();
    };
    const offTrack = (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove());
      refresh();
    };

    room
      .on(RoomEvent.TrackSubscribed, onTrack)
      .on(RoomEvent.TrackUnsubscribed, offTrack)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.LocalTrackUnpublished, refresh)
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.ParticipantPermissionsChanged, refresh)
      .on(RoomEvent.AudioPlaybackStatusChanged, refresh)
      .on(RoomEvent.MediaDevicesError, (e: Error) => onErrorRef.current(explain(e)))
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        setStatus(
          state === ConnectionState.Connected ? "connected"
            : state === ConnectionState.Disconnected ? "off"
            : "connecting",
        );
      });

    setStatus("connecting");
    room.connect(url, token).catch((e: unknown) => {
      setStatus("error");
      onErrorRef.current(`Ovoz/video serveriga ulanib bo'lmadi: ${e instanceof Error ? e.message : e}`);
    });

    return () => {
      room.removeAllListeners();
      room.disconnect();
      host.remove();
      roomRef.current = null;
      setRoom(null);
      setStatus("off");
    };
    // Token har qayta ulanishda yangilanadi; media faqat suhbatga kirib-chiqqanda qayta ulanadi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, url]);

  const local = room?.localParticipant;
  const speakingIds = new Set(room?.activeSpeakers.map((p) => p.identity) ?? []);

  const participantFor = (userId: string): Participant | undefined => {
    if (!room) return undefined;
    if (room.localParticipant.identity === userId) return room.localParticipant;
    return room.remoteParticipants.get(userId);
  };

  const byUser = (userId: string): ParticipantMedia => {
    const p = participantFor(userId);
    if (!p) return EMPTY;
    return {
      camera: trackOf(p, Track.Source.Camera),
      screen: trackOf(p, Track.Source.ScreenShare),
      micOn: p.isMicrophoneEnabled,
      speaking: speakingIds.has(userId),
    };
  };

  let screenSharer: LiveMediaApi["screenSharer"] = null;
  if (room) {
    for (const p of [room.localParticipant, ...room.remoteParticipants.values()]) {
      const track = trackOf(p, Track.Source.ScreenShare);
      if (track) {
        screenSharer = { userId: p.identity, track };
        break;
      }
    }
  }

  const run = useCallback(async (action: (r: Room) => Promise<unknown>, silentDenied = false) => {
    const r = roomRef.current;
    if (!r || r.state !== ConnectionState.Connected) {
      onErrorRef.current("Ovoz/video serveriga hali ulanilmagan.");
      return;
    }
    try {
      await action(r);
    } catch (e) {
      // Ekran tanlash oynasini yopish ham NotAllowedError beradi — bu xato emas.
      if (!(silentDenied && e instanceof Error && e.name === "NotAllowedError")) onErrorRef.current(explain(e));
    }
    refresh();
  }, []);

  return {
    status,
    canPublish: Boolean(local?.permissions?.canPublish),
    micOn: Boolean(local?.isMicrophoneEnabled),
    cameraOn: Boolean(local?.isCameraEnabled),
    screenOn: Boolean(local?.isScreenShareEnabled),
    audioBlocked: Boolean(room && status === "connected" && !room.canPlaybackAudio),
    byUser,
    screenSharer,
    toggleMic: () => run((r) => r.localParticipant.setMicrophoneEnabled(!r.localParticipant.isMicrophoneEnabled)),
    toggleCamera: () => run((r) => r.localParticipant.setCameraEnabled(!r.localParticipant.isCameraEnabled)),
    toggleScreen: () => run((r) => r.localParticipant.setScreenShareEnabled(!r.localParticipant.isScreenShareEnabled, { audio: true }), true),
    startAudio: () => run((r) => r.startAudio()),
  };
}

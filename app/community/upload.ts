/**
 * Rasm/video yuklash: katta rasmlar brauzerda kichraytiriladi (Telegram kabi),
 * so'ng fayl bo'laklab `/api/v1/media` ga yuboriladi. Tarmoq uzilsa, bo'lak
 * serverdagi holatdan davom ettiriladi.
 */
import {
  COMMUNITY_LIMITS,
  IMAGE_TYPES,
  VIDEO_TYPES,
  type MediaItem,
  type UploadProgress,
  type UploadTicket,
} from "@/shared/contract/community";

export class LoginRequiredError extends Error {}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/** `/api/v1` javobini ochadi; xato bo'lsa server xabari bilan tashlaydi. */
export async function apiCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(init.body && !(init.body instanceof Blob) ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const body = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (body?.ok) return body.data;
  const message = body && !body.ok ? body.error.message : "Server javob bermadi. Qayta urinib ko'ring.";
  if (response.status === 401) throw new LoginRequiredError(message);
  throw new Error(message);
}

const MAX_SIDE = 2560;
const KEEP_BYTES = 2.5 * 1024 * 1024;

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Eski Safari — pastdagi <img> usuliga o'tamiz.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Bu rasmni o'qib bo'lmadi. JPG yoki PNG formatida yuboring.");
  }
}

/** Katta yoki qo'llab-quvvatlanmaydigan (HEIC) rasmni JPEG ga aylantiradi. GIF o'zgarmaydi (animatsiya). */
async function prepareImage(file: File): Promise<{ blob: Blob; type: string; width: number; height: number }> {
  const supported = (IMAGE_TYPES as readonly string[]).includes(file.type);
  const image = await decode(file);
  try {
    const { width, height } = image;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    if (file.type === "image/gif" || (supported && scale === 1 && file.size <= KEEP_BYTES)) {
      return { blob: file, type: file.type, width, height };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Rasmni tayyorlab bo'lmadi.");
    ctx.fillStyle = "#fff"; // shaffof PNG qora bo'lib qolmasin
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) throw new Error("Rasmni tayyorlab bo'lmadi.");
    return { blob, type: "image/jpeg", width: canvas.width, height: canvas.height };
  } finally {
    image.close();
  }
}

function videoMeta(file: File): Promise<{ width: number; height: number; seconds: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (meta = { width: 0, height: 0, seconds: 0 }) => {
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    const timer = window.setTimeout(() => done(), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done({ width: video.videoWidth, height: video.videoHeight, seconds: Number.isFinite(video.duration) ? video.duration : 0 });
    };
    video.onerror = () => { window.clearTimeout(timer); done(); };
    video.src = url;
  });
}

export function isVideo(file: File): boolean {
  return file.type.startsWith("video/");
}

/** Fayl tanlash oynasidagi `accept`. */
export const MEDIA_ACCEPT = [...IMAGE_TYPES, "image/heic", "image/heif", ...VIDEO_TYPES].join(",");

export async function uploadMedia(file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<MediaItem> {
  let blob: Blob = file;
  let type = file.type;
  let width = 0, height = 0, seconds = 0;

  if (isVideo(file)) {
    if (!(VIDEO_TYPES as readonly string[]).includes(type)) throw new Error("Video MP4, WEBM yoki MOV formatida bo'lsin.");
    if (file.size > COMMUNITY_LIMITS.videoBytes) throw new Error("Video 300 MB dan oshmasin.");
    ({ width, height, seconds } = await videoMeta(file));
  } else if (file.type.startsWith("image/")) {
    ({ blob, type, width, height } = await prepareImage(file));
    if (blob.size > COMMUNITY_LIMITS.imageBytes) throw new Error("Rasm 15 MB dan oshmasin.");
  } else {
    throw new Error("Faqat rasm yoki video qo'shish mumkin.");
  }

  const ticket = await apiCall<UploadTicket>("/media", {
    method: "POST",
    body: JSON.stringify({ type, bytes: blob.size, width, height, seconds: Math.round(seconds) }),
    signal,
  });

  // Kichik bo'laklar — progress silliqroq ko'rinadi (server 8 MB gacha qabul qiladi).
  const chunk = Math.min(ticket.chunkBytes, 2 * 1024 * 1024);
  let offset = 0;
  let failures = 0;
  onProgress(0);
  while (offset < blob.size) {
    try {
      const result = await apiCall<UploadProgress>(`/media/${ticket.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream", "X-Upload-Offset": String(offset) },
        body: blob.slice(offset, offset + chunk),
        signal,
      });
      offset = result.received;
      failures = 0;
      onProgress(offset / blob.size);
      if (result.done && result.media) return result.media;
    } catch (error) {
      if (signal?.aborted || error instanceof LoginRequiredError || ++failures > 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * failures));
      // Server qancha olganini so'rab, o'sha joydan davom etamiz.
      offset = (await apiCall<UploadTicket>(`/media/${ticket.id}`, { signal })).received;
    }
  }
  throw new Error("Yuklash tugamadi. Qayta urinib ko'ring.");
}

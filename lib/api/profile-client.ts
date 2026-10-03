/** Profil: ism/bio va rasmlar (avatar, orqa fon). */
import { API_PREFIX } from "./config";

type Envelope<T> = { data?: T; error?: { message?: string; fields?: Record<string, string[]> } };

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, { credentials: "include", ...init });
  } catch {
    throw new Error("Internet aloqasini tekshiring.");
  }
  const body = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || body.data === undefined) {
    const field = body.error?.fields && Object.values(body.error.fields)[0]?.[0];
    throw new Error(field ?? body.error?.message ?? "So'rov bajarilmadi.");
  }
  return body.data;
}

export const saveProfileText = (input: { name: string; bio: string }) =>
  send<unknown>("/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });

export type ProfileImageKind = "avatar" | "cover";

export const uploadProfileImage = (kind: ProfileImageKind, file: Blob) =>
  send<{ url: string }>(`/profile/image?kind=${kind}`, { method: "POST", headers: { "Content-Type": file.type }, body: file }).then((d) => d.url);

export const removeProfileImage = (kind: ProfileImageKind) => send<{ removed: true }>(`/profile/image?kind=${kind}`, { method: "DELETE" });

/** Katta telefon suratlari serverga o'tmasligi uchun: eng uzun tomon `maxSide` gacha kichraytirilib JPEG qilinadi. */
export async function shrinkImage(file: File, maxSide: number): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob ?? file;
  } catch {
    return file;
  }
}

"use client";

import { FormEvent, useRef, useState } from "react";
import { Camera, ImageOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { notifyViewerChanged } from "@/lib/api/roles-client";
import { removeProfileImage, saveProfileText, shrinkImage, uploadProfileImage, type ProfileImageKind } from "@/lib/api/profile-client";
import { absoluteUrl } from "@/lib/api/config";
import type { Viewer } from "@/shared/contract";

const SIDES: Record<ProfileImageKind, number> = { avatar: 512, cover: 1600 };

/** Shaxsiy ma'lumotlar: avatar, orqa fon rasmi, ism va "o'zim haqimda". */
export default function AccountEditor({ viewer, onRename }: { viewer: Viewer; onRename: (name: string) => void }) {
  const [name, setName] = useState(viewer.name);
  const [bio, setBio] = useState(viewer.bio);
  const [busy, setBusy] = useState<ProfileImageKind | "text" | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const initial = (name.trim() || "K").slice(0, 1).toUpperCase();

  async function pick(kind: ProfileImageKind, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Faqat rasm tanlang.");
    setBusy(kind);
    try {
      await uploadProfileImage(kind, await shrinkImage(file, SIDES[kind]));
      notifyViewerChanged();
      toast.success(kind === "avatar" ? "Rasm yangilandi." : "Orqa fon yangilandi.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rasm yuklanmadi.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind: ProfileImageKind) {
    setBusy(kind);
    try {
      await removeProfileImage(kind);
      notifyViewerChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "O‘chirilmadi.");
    } finally {
      setBusy(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return void toast.error("Ismingizni yozing.");
    setBusy("text");
    try {
      await saveProfileText({ name: clean, bio: bio.trim() });
      onRename(clean);
      notifyViewerChanged();
      toast.success("Saqlandi.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Saqlanmadi.");
    } finally {
      setBusy(null);
    }
  }

  const cover = absoluteUrl(viewer.coverUrl);
  const avatar = absoluteUrl(viewer.avatarUrl);

  return (
    <form className="acc" onSubmit={(e) => void save(e)}>
      <div className="acc-cover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
        <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void pick("cover", e.target.files?.[0]); e.target.value = ""; }} />
        <div className="acc-cover-tools">
          <button type="button" className="acc-round" onClick={() => coverInput.current?.click()} disabled={busy !== null} aria-label="Orqa fon rasmini tanlash"><Camera size={18} /></button>
          {cover && <button type="button" className="acc-round" onClick={() => void remove("cover")} disabled={busy !== null} aria-label="Orqa fonni olib tashlash"><ImageOff size={18} /></button>}
        </div>
        {!cover && <span className="acc-cover-hint">Orqa fon rasmi</span>}
      </div>

      <div className="acc-avatar-row">
        <div className="acc-avatar">
          {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : initial}
          <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void pick("avatar", e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" className="acc-round acc-avatar-cam" onClick={() => avatarInput.current?.click()} disabled={busy !== null} aria-label="Profil rasmini tanlash"><Camera size={16} /></button>
        </div>
        {avatar && <button type="button" className="acc-round" onClick={() => void remove("avatar")} disabled={busy !== null} aria-label="Profil rasmini olib tashlash"><Trash2 size={17} /></button>}
      </div>

      <label className="pw-field" htmlFor="acc-name"><span>Ism</span><input id="acc-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      <label className="pw-field" htmlFor="acc-bio"><span>O‘zim haqimda</span><textarea id="acc-bio" value={bio} maxLength={160} rows={3} onChange={(e) => setBio(e.target.value)} /></label>
      <button type="submit" className="button" disabled={busy !== null}>{busy === "text" ? "Saqlanmoqda…" : "Saqlash"}</button>
    </form>
  );
}

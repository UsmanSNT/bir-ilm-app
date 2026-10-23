"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { absoluteUrl } from "@/lib/api/config";
import { shrinkImage } from "@/lib/api/profile-client";
import {
  createTeamMember,
  deleteTeamMember,
  fetchTeamAdmin,
  moveTeamMember,
  notifySiteChanged,
  removeTeamPhoto,
  updateTeamMember,
  uploadTeamPhoto,
} from "@/lib/api/site-client";
import { TEAM_LIMITS, type TeamMember } from "@/shared/contract";

type Draft = { id: string | null; name: string; role: string; bio: string; telegram: string; instagram: string; visible: boolean };

const EMPTY: Draft = { id: null, name: "", role: "", bio: "", telegram: "", instagram: "", visible: true };
const toDraft = ({ id, name, role, bio, telegram, instagram, visible }: TeamMember): Draft => ({ id, name, role, bio, telegram, instagram, visible });

/** Admin: «Biz haqimizda» sahifasidagi jamoa kartalari. Saytda shu ro'yxat tartibida ko'rinadi. */
export default function AdminTeam() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetchTeamAdmin()
      .then((list) => { if (alive) setMembers(list); })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  /** Har bir o'zgarishdan keyin server qaytargan ro'yxat — yagona haqiqat manbai. */
  async function run(action: () => Promise<TeamMember[]>, success?: string): Promise<TeamMember[] | null> {
    setBusy(true);
    setError("");
    try {
      const list = await action();
      setMembers(list);
      notifySiteChanged();
      if (success) toast.success(success);
      return list;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    const { id, ...input } = draft;
    if (id) {
      if (await run(() => updateTeamMember(id, input), "Saqlandi")) setDraft(null);
      return;
    }
    const list = await run(() => createTeamMember(input), "Qo‘shildi — endi rasm qo‘yishingiz mumkin");
    // Yangi a'zo ro'yxat oxirida: rasm qo'yish uchun tahrirlash davom etadi.
    const created = list?.at(-1);
    if (created) setDraft(toDraft(created));
  }

  async function pickPhoto(file: File | undefined) {
    if (!file || !draft?.id) return;
    const id = draft.id;
    await run(async () => uploadTeamPhoto(id, await shrinkImage(file, 900)), "Rasm yangilandi");
    if (fileInput.current) fileInput.current.value = "";
  }

  function remove(member: TeamMember) {
    if (!window.confirm(`«${member.name}» o‘chirilsinmi? Bu qaytarilmaydi.`)) return;
    void run(() => deleteTeamMember(member.id), "O‘chirildi");
    if (draft?.id === member.id) setDraft(null);
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current));
  const editing = draft?.id ? members?.find((m) => m.id === draft.id) ?? null : null;

  if (members === null) return <div className="admin-panel">{error ? <p className="admin-error" role="alert">{error}</p> : <p className="admin-empty">Yuklanmoqda…</p>}</div>;

  if (draft) {
    return (
      <form className="admin-panel ab-admin" onSubmit={(e) => void save(e)}>
        <div className="ab-admin-head">
          <h2>{draft.id ? "A‘zoni tahrirlash" : "Yangi a‘zo"}</h2>
          <button type="button" className="ab-admin-icon" aria-label="Yopish" onClick={() => setDraft(null)}><X size={18} /></button>
        </div>

        {draft.id ? (
          <div className="ab-admin-photo">
            <span className="ab-admin-avatar large">
              {editing?.photoUrl ? <img src={absoluteUrl(editing.photoUrl)} alt="" /> : draft.name.slice(0, 1).toUpperCase() || "?"}
            </span>
            <div>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
              <button type="button" className="ab-admin-btn" disabled={busy} onClick={() => fileInput.current?.click()}><ImagePlus size={16} /> {editing?.photoUrl ? "Rasmni almashtirish" : "Rasm qo‘yish"}</button>
              {editing?.photoUrl && <button type="button" className="ab-admin-btn" disabled={busy} onClick={() => void run(() => removeTeamPhoto(editing.id), "Rasm olib tashlandi")}>Olib tashlash</button>}
              <small>JPG, PNG yoki WebP. Kvadrat yoki portret surat yaxshi chiqadi.</small>
            </div>
          </div>
        ) : (
          <p className="admin-hint">Rasm saqlangandan keyin qo‘yiladi.</p>
        )}

        <label className="ab-admin-field">
          <span>Ism familiya *</span>
          <input required maxLength={TEAM_LIMITS.name} value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="ab-admin-field">
          <span>Lavozim</span>
          <input maxLength={TEAM_LIMITS.role} placeholder="Masalan: Moderator" value={draft.role} onChange={(e) => set("role", e.target.value)} />
        </label>
        <label className="ab-admin-field">
          <span>Qisqa ma‘lumot <small>{draft.bio.length}/{TEAM_LIMITS.bio}</small></span>
          <textarea rows={4} maxLength={TEAM_LIMITS.bio} value={draft.bio} onChange={(e) => set("bio", e.target.value)} />
        </label>
        <div className="ab-admin-two">
          <label className="ab-admin-field">
            <span>Telegram</span>
            <input placeholder="@nom yoki t.me/nom" autoComplete="off" value={draft.telegram} onChange={(e) => set("telegram", e.target.value)} />
          </label>
          <label className="ab-admin-field">
            <span>Instagram</span>
            <input placeholder="@nom yoki instagram.com/nom" autoComplete="off" value={draft.instagram} onChange={(e) => set("instagram", e.target.value)} />
          </label>
        </div>
        <label className="ab-admin-check">
          <input type="checkbox" checked={draft.visible} onChange={(e) => set("visible", e.target.checked)} />
          {draft.visible ? <Eye size={16} /> : <EyeOff size={16} />} Saytda ko‘rinsin
        </label>

        {error && <p className="admin-error" role="alert">{error}</p>}
        <button className="admin-add-book" disabled={busy}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
      </form>
    );
  }

  return (
    <div className="admin-panel ab-admin">
      <p className="admin-hint">Kartalar «Biz haqimizda» sahifasida shu tartibda ko‘rinadi. Yangi a‘zo ro‘yxat oxiriga qo‘shiladi.</p>
      <button type="button" className="admin-add-book" onClick={() => { setError(""); setDraft({ ...EMPTY }); }}><Plus size={17} /> Yangi a‘zo</button>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {members.length === 0 && <p className="admin-empty">Hali hech kim qo‘shilmagan.</p>}
      <ol className="ab-admin-list">
        {members.map((member, index) => (
          <li key={member.id} className={member.visible ? undefined : "is-hidden"}>
            <span className="ab-admin-order">{index + 1}</span>
            <span className="ab-admin-avatar">{member.photoUrl ? <img src={absoluteUrl(member.photoUrl)} alt="" /> : member.name.slice(0, 1).toUpperCase()}</span>
            <span className="ab-admin-info">
              <strong>{member.name}</strong>
              <small>{member.role || "Lavozim yozilmagan"}{member.visible ? "" : " · yashirin"}</small>
            </span>
            <span className="ab-admin-actions">
              <button type="button" aria-label={`${member.name}: yuqoriga`} disabled={busy || index === 0} onClick={() => void run(() => moveTeamMember(member.id, "up"))}><ArrowUp size={16} /></button>
              <button type="button" aria-label={`${member.name}: pastga`} disabled={busy || index === members.length - 1} onClick={() => void run(() => moveTeamMember(member.id, "down"))}><ArrowDown size={16} /></button>
              <button type="button" aria-label={`${member.name}: tahrirlash`} onClick={() => { setError(""); setDraft(toDraft(member)); }}><Pencil size={16} /></button>
              <button type="button" aria-label={`${member.name}: o‘chirish`} className="is-danger" disabled={busy} onClick={() => remove(member)}><Trash2 size={16} /></button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

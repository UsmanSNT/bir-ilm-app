"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
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
import { TEAM_AVATARS, TEAM_LIMITS, type TeamMember } from "@/shared/contract";
import TeamAvatarArt from "./team-avatar";

type Draft = Pick<TeamMember, "name" | "role" | "bio" | "telegram" | "instagram" | "youtube" | "facebook" | "website" | "avatar" | "former" | "period" | "visible"> & { id: string | null };
type Pending = { file: File; url: string };

const EMPTY: Draft = { id: null, name: "", role: "", bio: "", telegram: "", instagram: "", youtube: "", facebook: "", website: "", avatar: null, former: false, period: "", visible: true };
const toDraft = ({ id, name, role, bio, telegram, instagram, youtube, facebook, website, avatar, former, period, visible }: TeamMember): Draft => ({ id, name, role, bio, telegram, instagram, youtube, facebook, website, avatar, former, period, visible });

/** Kartadagi kabi: rasm → avatar → bosh harf. */
function Thumb({ photo, avatar, name, className }: { photo: string | null; avatar: TeamMember["avatar"]; name: string; className: string }) {
  return (
    <span className={className}>
      {photo ? <img src={photo} alt="" /> : avatar ? <TeamAvatarArt kind={avatar} /> : name.slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

/** Admin: «Biz haqimizda» sahifasidagi jamoa kartalari. Saytda shu ro'yxat tartibida ko'rinadi. */
export default function AdminTeam() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Yangi a'zoga tanlangan rasm: a'zo saqlangach yuklanadi.
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingUrl = useRef<string | null>(null);
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

  useEffect(() => () => { if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current); }, []);

  function keepPending(file: File | null) {
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
    pendingUrl.current = file ? URL.createObjectURL(file) : null;
    setPending(file && pendingUrl.current ? { file, url: pendingUrl.current } : null);
  }

  function openDraft(next: Draft | null) {
    keepPending(null);
    setError("");
    setDraft(next);
  }

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
    if (!draft || busy || !members) return;
    const { id, ...input } = draft;
    if (id) {
      if (await run(() => updateTeamMember(id, input), "Saqlandi")) openDraft(null);
      return;
    }
    const known = new Set(members.map((member) => member.id));
    const list = await run(() => createTeamMember(input));
    const added = list?.find((member) => !known.has(member.id));
    if (!list) return;
    if (!added || !pending) {
      toast.success("Qo‘shildi");
      openDraft(null);
      return;
    }
    const file = pending.file;
    if (await run(async () => uploadTeamPhoto(added.id, await shrinkImage(file, 900)), "Qo‘shildi")) {
      openDraft(null);
      return;
    }
    // A'zo saqlandi, rasm yuklanmadi: tahrirlashda qoladi, rasmni qayta tanlash mumkin.
    keepPending(null);
    setDraft(toDraft(added));
  }

  async function pickPhoto(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (!file || !draft) return;
    if (!file.type.startsWith("image/")) {
      setError("Faqat rasm fayli (JPG, PNG yoki WebP) tanlang.");
      return;
    }
    setError("");
    if (!draft.id) {
      keepPending(file);
      return;
    }
    const id = draft.id;
    await run(async () => uploadTeamPhoto(id, await shrinkImage(file, 900)), "Rasm yangilandi");
  }

  function remove(member: TeamMember) {
    if (!window.confirm(`«${member.name}» o‘chirilsinmi? Bu qaytarilmaydi.`)) return;
    void run(() => deleteTeamMember(member.id), "O‘chirildi");
    if (draft?.id === member.id) openDraft(null);
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current));
  const editing = draft?.id ? members?.find((m) => m.id === draft.id) ?? null : null;

  if (members === null) return <div className="admin-panel">{error ? <p className="admin-error" role="alert">{error}</p> : <p className="admin-empty">Yuklanmoqda…</p>}</div>;

  if (draft) {
    const photo = editing?.photoUrl ? absoluteUrl(editing.photoUrl) : pending?.url ?? null;
    return (
      <form className="admin-panel ab-admin" onSubmit={(e) => void save(e)}>
        <div className="ab-admin-head">
          <button type="button" className="ab-admin-back" onClick={() => openDraft(null)}><ArrowLeft size={16} /> Ro‘yxatga qaytish</button>
        </div>
        <h2 className="ab-admin-title">{draft.id ? "A‘zoni tahrirlash" : draft.former ? "Sobiq a‘zo" : "Yangi a‘zo"}</h2>

        <div className="ab-admin-photo">
          <Thumb className="ab-admin-avatar large" photo={photo} avatar={draft.avatar} name={draft.name} />
          <div>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
            <button type="button" className="ab-admin-btn" disabled={busy} onClick={() => fileInput.current?.click()}><ImagePlus size={16} /> {photo ? "Rasmni almashtirish" : "Rasm qo‘yish"}</button>
            {editing?.photoUrl && <button type="button" className="ab-admin-btn" disabled={busy} onClick={() => void run(() => removeTeamPhoto(editing.id), "Rasm olib tashlandi")}>Olib tashlash</button>}
            {!draft.id && pending && <button type="button" className="ab-admin-btn" disabled={busy} onClick={() => keepPending(null)}>Olib tashlash</button>}
            <small>
              {pending && !draft.id ? `«${pending.file.name}» — a‘zo saqlanganda yuklanadi. ` : ""}
              JPG, PNG yoki WebP. Kvadrat yoki portret surat yaxshi chiqadi.
            </small>
          </div>
        </div>

        <fieldset className="ab-avatar-pick">
          <legend>Rasm qo‘ymasangiz — avatar tanlang</legend>
          <div className="ab-avatar-options">
            <label className={draft.avatar === null ? "is-on" : undefined}>
              <input type="radio" name="avatar" checked={draft.avatar === null} onChange={() => set("avatar", null)} />
              <span className="ab-avatar-tile is-initials" aria-hidden="true">{draft.name.slice(0, 1).toUpperCase() || "A"}</span>
              <b>Bosh harf</b>
            </label>
            {TEAM_AVATARS.map(({ key, label }) => (
              <label key={key} className={draft.avatar === key ? "is-on" : undefined}>
                <input type="radio" name="avatar" checked={draft.avatar === key} onChange={() => set("avatar", key)} />
                <span className="ab-avatar-tile"><TeamAvatarArt kind={key} /></span>
                <b>{label}</b>
              </label>
            ))}
          </div>
          {photo && <small>Rasm bor — saytda rasm ko‘rinadi. Avatar rasm olib tashlansa chiqadi.</small>}
        </fieldset>

        <fieldset className="ab-segment">
          <legend>Jamoadagi holati</legend>
          <label className={!draft.former ? "is-on" : undefined}>
            <input type="radio" name="former" checked={!draft.former} onChange={() => set("former", false)} />
            Hozirgi jamoa
          </label>
          <label className={draft.former ? "is-on" : undefined}>
            <input type="radio" name="former" checked={draft.former} onChange={() => set("former", true)} />
            Avval jamoada bo‘lgan
          </label>
        </fieldset>

        <label className="ab-admin-field">
          <span>Ism familiya *</span>
          <input required maxLength={TEAM_LIMITS.name} value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <div className="ab-admin-two">
          <label className="ab-admin-field">
            <span>Lavozim</span>
            <input maxLength={TEAM_LIMITS.role} placeholder={draft.former ? "Masalan: Loyiha asoschisi" : "Masalan: Moderator"} value={draft.role} onChange={(e) => set("role", e.target.value)} />
          </label>
          <label className="ab-admin-field">
            <span>Davri {draft.former ? "" : <small>ixtiyoriy</small>}</span>
            <input maxLength={TEAM_LIMITS.period} placeholder="Masalan: 2022–2024" value={draft.period} onChange={(e) => set("period", e.target.value)} />
          </label>
        </div>
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
          <label className="ab-admin-field">
            <span>YouTube</span>
            <input inputMode="url" placeholder="youtube.com/@kanal" autoComplete="off" maxLength={TEAM_LIMITS.url} value={draft.youtube} onChange={(e) => set("youtube", e.target.value)} />
          </label>
          <label className="ab-admin-field">
            <span>Facebook</span>
            <input inputMode="url" placeholder="facebook.com/sahifa" autoComplete="off" maxLength={TEAM_LIMITS.url} value={draft.facebook} onChange={(e) => set("facebook", e.target.value)} />
          </label>
        </div>
        <label className="ab-admin-field">
          <span>Veb-sayt <small>shaxsiy sahifa, blog yoki portfolio</small></span>
          <input inputMode="url" placeholder="masalan: avrangzeb.uz" autoComplete="off" maxLength={TEAM_LIMITS.url} value={draft.website} onChange={(e) => set("website", e.target.value)} />
        </label>
        <label className="ab-admin-check">
          <input type="checkbox" checked={draft.visible} onChange={(e) => set("visible", e.target.checked)} />
          {draft.visible ? <Eye size={16} /> : <EyeOff size={16} />} Saytda ko‘rinsin
        </label>

        {error && <p className="admin-error" role="alert">{error}</p>}
        <button className="admin-add-book" disabled={busy}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
      </form>
    );
  }

  const groups = [
    { key: "current", title: "Hozirgi jamoa", empty: "Hali hech kim qo‘shilmagan.", add: "Yangi a‘zo", former: false },
    { key: "former", title: "Avval jamoada bo‘lganlar", empty: "Sobiq a‘zolar hali qo‘shilmagan.", add: "Sobiq a‘zo qo‘shish", former: true },
  ] as const;

  return (
    <div className="admin-panel ab-admin">
      <p className="admin-hint">Hozirgi jamoa va sobiq a‘zolar «Biz haqimizda» sahifasida alohida bo‘limlarda, shu tartibda ko‘rinadi. Yangi a‘zo o‘z bo‘limining oxiriga qo‘shiladi.</p>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {groups.map((group) => {
        const list = members.filter((member) => member.former === group.former);
        return (
          <section key={group.key} className="ab-admin-group" aria-label={group.title}>
            <div className="ab-admin-group-head">
              <h3>{group.title} <span>{list.length}</span></h3>
              <button type="button" className="ab-admin-btn" onClick={() => openDraft({ ...EMPTY, former: group.former })}><Plus size={16} /> {group.add}</button>
            </div>
            {list.length === 0 && <p className="admin-empty">{group.empty}</p>}
            <ol className="ab-admin-list">
              {list.map((member, index) => (
                <li key={member.id} className={member.visible ? undefined : "is-hidden"}>
                  <span className="ab-admin-order">{index + 1}</span>
                  <Thumb className="ab-admin-avatar" photo={member.photoUrl ? absoluteUrl(member.photoUrl) : null} avatar={member.avatar} name={member.name} />
                  <span className="ab-admin-info">
                    <strong>{member.name}</strong>
                    <small>{[member.role || "Lavozim yozilmagan", member.period, member.visible ? "" : "yashirin"].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className="ab-admin-actions">
                    <button type="button" aria-label={`${member.name}: yuqoriga`} disabled={busy || index === 0} onClick={() => void run(() => moveTeamMember(member.id, "up"))}><ArrowUp size={16} /></button>
                    <button type="button" aria-label={`${member.name}: pastga`} disabled={busy || index === list.length - 1} onClick={() => void run(() => moveTeamMember(member.id, "down"))}><ArrowDown size={16} /></button>
                    <button type="button" aria-label={`${member.name}: tahrirlash`} onClick={() => openDraft(toDraft(member))}><Pencil size={16} /></button>
                    <button type="button" aria-label={`${member.name}: o‘chirish`} className="is-danger" disabled={busy} onClick={() => remove(member)}><Trash2 size={16} /></button>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

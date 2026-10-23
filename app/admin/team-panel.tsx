"use client";
/* eslint-disable @next/next/no-img-element -- admin suratlari data URL, next/image kerak emas */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { TeamMember } from "@/lib/team";
import { TEAM_LIMITS } from "@/lib/team";

type Draft = Omit<TeamMember, "id" | "sortOrder"> & { id?: string };

const emptyDraft: Draft = { name: "", role: "", bio: "", photo: "", telegram: "", instagram: "", visible: true };
const API = "/api/admin/team";

/** Rasmni kvadrat 400x400 JPEG ga keltiradi, shunda bazada kichik saqlanadi. */
async function resizeImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 400;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Rasm qayta ishlanmadi.");
  context.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 400, 400);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function TeamPanel() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const request = useCallback(async (method: string, body?: unknown, query = "") => {
    setBusy(true);
    try {
      const response = await fetch(API + query, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json()) as { members?: TeamMember[]; error?: string };
      if (!response.ok || !payload.members) throw new Error(payload.error ?? "Xatolik yuz berdi.");
      setMembers(payload.members);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Xatolik yuz berdi.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void request("GET"), 0);
    return () => clearTimeout(timer);
  }, [request]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const ok = await request(draft.id ? "PUT" : "POST", draft);
    if (ok) {
      toast.success(draft.id ? "Saqlandi" : "A'zo qo'shildi");
      setDraft(null);
    }
  };

  const remove = async (member: TeamMember) => {
    if (!window.confirm(`"${member.name}" o'chirilsinmi? Bu qaytarilmaydi.`)) return;
    if (await request("DELETE", undefined, `?id=${encodeURIComponent(member.id)}`)) toast.success("O'chirildi");
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file || !draft) return;
    try {
      setDraft({ ...draft, photo: await resizeImage(file) });
    } catch {
      toast.error("Rasm o'qilmadi. JPEG, PNG yoki WebP tanlang.");
    }
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => draft && setDraft({ ...draft, [key]: value });

  return (
    <section aria-label="Jamoa a'zolari">
      <div className="admin-toolbar">
        <p>A&apos;zolar saytda shu tartibda ko&apos;rinadi. Yangi a&apos;zo ro&apos;yxat oxiriga qo&apos;shiladi.</p>
        <button className="admin-btn primary" onClick={() => setDraft({ ...emptyDraft })} disabled={busy}>
          <Plus size={16} /> Yangi a&apos;zo
        </button>
      </div>

      {members === null ? (
        <p className="admin-empty">Yuklanmoqda…</p>
      ) : members.length === 0 ? (
        <p className="admin-empty">Hali a&apos;zo yo&apos;q. &quot;Yangi a&apos;zo&quot; tugmasini bosing.</p>
      ) : (
        <ol className="admin-list">
          {members.map((member, index) => (
            <li className={`admin-row${member.visible ? "" : " hidden"}`} key={member.id}>
              <span className="admin-order">{index + 1}</span>
              <div className="admin-avatar">
                {member.photo ? <img src={member.photo} alt="" /> : <span>{member.name[0]}</span>}
              </div>
              <div className="admin-info">
                <strong>{member.name}</strong>
                <small>{member.role || "Lavozim kiritilmagan"}{member.visible ? "" : " · yashirin"}</small>
              </div>
              <div className="admin-row-actions">
                <button aria-label="Yuqoriga" disabled={busy || index === 0} onClick={() => request("PATCH", { id: member.id, direction: "up" })}><ArrowUp size={16} /></button>
                <button aria-label="Pastga" disabled={busy || index === members.length - 1} onClick={() => request("PATCH", { id: member.id, direction: "down" })}><ArrowDown size={16} /></button>
                <button aria-label="Tahrirlash" onClick={() => setDraft({ ...member })}><Pencil size={16} /></button>
                <button aria-label="O'chirish" className="danger" disabled={busy} onClick={() => remove(member)}><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {draft && (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-form-title">
          <form className="admin-form" onSubmit={save}>
            <div className="admin-form-head">
              <h2 id="admin-form-title">{draft.id ? "A'zoni tahrirlash" : "Yangi a'zo"}</h2>
              <button type="button" aria-label="Yopish" onClick={() => setDraft(null)}><X size={18} /></button>
            </div>

            <div className="admin-photo">
              <div className="admin-avatar large">
                {draft.photo ? <img src={draft.photo} alt="" /> : <span>{draft.name[0] ?? "?"}</span>}
              </div>
              <div>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
                <button type="button" className="admin-btn" onClick={() => fileInput.current?.click()}><ImagePlus size={16} /> Surat tanlash</button>
                {draft.photo && <button type="button" className="admin-btn" onClick={() => set("photo", "")}>Suratni olib tashlash</button>}
              </div>
            </div>

            <label>Ism familiya *
              <input required maxLength={TEAM_LIMITS.name} value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </label>
            <label>Lavozim
              <input maxLength={TEAM_LIMITS.role} value={draft.role} onChange={(e) => set("role", e.target.value)} />
            </label>
            <label>Qisqa ma&apos;lumot ({draft.bio.length}/{TEAM_LIMITS.bio})
              <textarea rows={4} maxLength={TEAM_LIMITS.bio} value={draft.bio} onChange={(e) => set("bio", e.target.value)} />
            </label>
            <div className="admin-two">
              <label>Telegram (@siz)
                <input maxLength={33} pattern="@?[A-Za-z0-9._]{1,32}" title="Faqat harf, raqam, nuqta va pastki chiziq" value={draft.telegram} onChange={(e) => set("telegram", e.target.value)} />
              </label>
              <label>Instagram (@siz)
                <input maxLength={33} pattern="@?[A-Za-z0-9._]{1,32}" title="Faqat harf, raqam, nuqta va pastki chiziq" value={draft.instagram} onChange={(e) => set("instagram", e.target.value)} />
              </label>
            </div>
            <label className="admin-check">
              <input type="checkbox" checked={draft.visible} onChange={(e) => set("visible", e.target.checked)} />
              {draft.visible ? <Eye size={16} /> : <EyeOff size={16} />} Saytda ko&apos;rinsin
            </label>

            <div className="admin-form-foot">
              <button type="button" className="admin-btn" onClick={() => setDraft(null)}>Bekor qilish</button>
              <button type="submit" className="admin-btn primary" disabled={busy}><Save size={16} /> Saqlash</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

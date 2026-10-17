"use client";

import { FormEvent, useRef, useState } from "react";
import { AtSign, Briefcase, CalendarDays, Camera, ChevronRight, ImagePlus, Mail, Pencil, Send, Trash2, UserRound, Users, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { notifyViewerChanged } from "@/lib/api/roles-client";
import { removeProfileImage, saveProfile, shrinkImage, uploadProfileImage, type ProfileImageKind } from "@/lib/api/profile-client";
import { absoluteUrl } from "@/lib/api/config";
import { GENDER_LABELS, LIMITS, USERNAME_PATTERN, normalizeUsername, type Gender, type UpdateProfileInput, type Viewer } from "@/shared/contract";

const SIDES: Record<ProfileImageKind, number> = { avatar: 512, cover: 1600 };

type Field = "name" | "username" | "profession" | "birthDate" | "gender";

const FIELD_TITLES: Record<Field, string> = {
  name: "To‘liq ism",
  username: "Tahallus",
  profession: "Kasb yoki soha",
  birthDate: "Tug‘ilgan sana",
  gender: "Jins",
};

const FIELD_HINTS: Record<Field, string> = {
  name: "Postlar va izohlarda shu ism ko‘rinadi.",
  username: "3–24 belgi: lotin harflari, raqam, «_» yoki «.». Boshqalar sizni @tahallus orqali topadi.",
  profession: "Profilingizda ko‘rinadi. Masalan: «Talaba», «Muhandis», «Ustoz».",
  birthDate: "Faqat sizga ko‘rinadi.",
  gender: "Faqat sizga ko‘rinadi.",
};

/** «1999-07-14» → «14.07.1999». */
const dotted = (iso: string) => iso.split("-").reverse().join(".");

/** Kamida 5 yosh: kiritish mumkin bo'lgan eng so'nggi sana. */
function latestBirthDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 5);
  return date.toISOString().slice(0, 10);
}

function draftOf(viewer: Viewer, field: Field): string {
  if (field === "username") return viewer.username ?? "";
  if (field === "birthDate") return viewer.birthDate ?? "";
  if (field === "gender") return viewer.gender ?? "";
  return viewer[field];
}

/** Shaxsiy ma'lumotlar: muqova va avatar, «men haqimda», shaxsiy maydonlar (har biri alohida oynada) va bog'langan hisoblar. */
export default function AccountEditor({ viewer, onRename }: { viewer: Viewer; onRename: (name: string) => void }) {
  const [busy, setBusy] = useState<ProfileImageKind | "text" | null>(null);
  const [bioOpen, setBioOpen] = useState(false);
  const [bio, setBio] = useState(viewer.bio);
  const [field, setField] = useState<Field | null>(null);
  const [draft, setDraft] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const cover = absoluteUrl(viewer.coverUrl);
  const avatar = absoluteUrl(viewer.avatarUrl);
  const initial = (viewer.name.trim() || "K").slice(0, 1).toUpperCase();

  async function pick(kind: ProfileImageKind, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Faqat rasm tanlang.");
    setBusy(kind);
    try {
      await uploadProfileImage(kind, await shrinkImage(file, SIDES[kind]));
      notifyViewerChanged();
      toast.success(kind === "avatar" ? "Rasm yangilandi." : "Muqova yangilandi.");
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

  async function save(input: UpdateProfileInput, done: () => void) {
    setBusy("text");
    try {
      await saveProfile(input);
      if (input.name) onRename(input.name);
      notifyViewerChanged();
      toast.success("Saqlandi.");
      done();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Saqlanmadi.");
    } finally {
      setBusy(null);
    }
  }

  function openField(next: Field) {
    setDraft(draftOf(viewer, next));
    setField(next);
  }

  /** Mijozda oldindan tekshiriladi; server baribir o'zi ham tekshiradi. */
  function submitField(event: FormEvent) {
    event.preventDefault();
    if (!field) return;
    const value = draft.trim();
    let input: UpdateProfileInput;
    if (field === "name") {
      if (!value) return void toast.error("Ismingizni yozing.");
      input = { name: value };
    } else if (field === "username") {
      const username = normalizeUsername(value);
      if (username && !USERNAME_PATTERN.test(username)) return void toast.error("Tahallus 3–24 belgi: lotin harflari, raqam, «_» yoki «.» bo‘lsin.");
      input = { username: username || null };
    } else if (field === "profession") {
      input = { profession: value };
    } else if (field === "birthDate") {
      input = { birthDate: value || null };
    } else {
      input = { gender: (value || null) as Gender | null };
    }
    void save(input, () => setField(null));
  }

  const rows: { id: Field; icon: LucideIcon; value: string }[] = [
    { id: "name", icon: UserRound, value: viewer.name },
    { id: "username", icon: AtSign, value: viewer.username ? `@${viewer.username}` : "" },
    { id: "profession", icon: Briefcase, value: viewer.profession },
    { id: "birthDate", icon: CalendarDays, value: viewer.birthDate ? dotted(viewer.birthDate) : "" },
    { id: "gender", icon: Users, value: viewer.gender ? GENDER_LABELS[viewer.gender] : "" },
  ];

  const contacts = viewer.accounts.map((account) => ({
    key: account.provider,
    icon: account.provider === "telegram" ? Send : Mail,
    title: account.provider === "google" ? "Google" : account.provider === "telegram" ? "Telegram" : "Email",
    value: account.label,
  }));

  return (
    <div className="acc2">
      <div className={`acc2-cover${cover ? " has-image" : ""}`} style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
        <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void pick("cover", e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" className="acc2-cam" onClick={() => coverInput.current?.click()} disabled={busy !== null} aria-label="Muqova rasmini tanlash" title="Muqova rasmi">
          <ImagePlus size={24} />
        </button>
        {cover && (
          <button type="button" className="acc2-remove" onClick={() => void remove("cover")} disabled={busy !== null} aria-label="Muqovani olib tashlash" title="Muqovani olib tashlash">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="acc2-avatar-row">
        <div className="acc2-avatar">
          {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : initial}
          <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void pick("avatar", e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" className="acc2-cam is-avatar" onClick={() => avatarInput.current?.click()} disabled={busy !== null} aria-label="Profil rasmini tanlash" title="Profil rasmi">
            <Camera size={22} />
          </button>
        </div>
        {avatar && (
          <button type="button" className="acc2-remove is-inline" onClick={() => void remove("avatar")} disabled={busy !== null} aria-label="Profil rasmini olib tashlash" title="Profil rasmini olib tashlash">
            <Trash2 size={16} /> Rasmni olib tashlash
          </button>
        )}
      </div>

      <section className="acc2-card">
        <div className="acc2-card-head">
          <h2>Qisqacha men haqimda</h2>
          {!bioOpen && (
            <button type="button" className="acc2-icon-btn" onClick={() => { setBio(viewer.bio); setBioOpen(true); }} aria-label="«Men haqimda»ni tahrirlash" title="Tahrirlash">
              <Pencil size={18} />
            </button>
          )}
        </div>
        {bioOpen ? (
          <form className="acc2-bio-form" onSubmit={(e) => { e.preventDefault(); void save({ bio: bio.trim() }, () => setBioOpen(false)); }}>
            <textarea value={bio} maxLength={LIMITS.bio} rows={4} onChange={(e) => setBio(e.target.value)} placeholder="Kim ekansiz, nimalarni o‘qiysiz, qayerda o‘qiysiz…" autoFocus aria-label="Men haqimda" />
            <small>{bio.length} / {LIMITS.bio}</small>
            <div className="acc2-actions">
              <button type="button" className="acc2-ghost" onClick={() => setBioOpen(false)} disabled={busy !== null}>Bekor qilish</button>
              <button type="submit" className="acc2-primary" disabled={busy !== null}>{busy === "text" ? "Saqlanmoqda…" : "Saqlash"}</button>
            </div>
          </form>
        ) : (
          <p className={viewer.bio ? "acc2-bio" : "acc2-bio is-empty"}>{viewer.bio || "Hali hech narsa yozilmagan."}</p>
        )}
      </section>

      <section className="acc2-card">
        <h2>Shaxsiy ma’lumotlar</h2>
        <ul className="acc2-list">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <li key={row.id}>
                <button type="button" className="acc2-row" onClick={() => openField(row.id)}>
                  <Icon size={19} aria-hidden="true" />
                  <span>{FIELD_TITLES[row.id]}</span>
                  <small className={row.value ? undefined : "is-empty"}>{row.value || "Kiritilmagan"}</small>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="acc2-note">Tug‘ilgan sana va jins faqat sizga ko‘rinadi.</p>
      </section>

      <section className="acc2-card">
        <h2>Aloqa ma’lumotlari</h2>
        {contacts.length ? (
          <ul className="acc2-list">
            {contacts.map((contact) => {
              const Icon = contact.icon;
              return (
                <li key={contact.key}>
                  <div className="acc2-row is-static">
                    <Icon size={19} aria-hidden="true" />
                    <span>{contact.title}</span>
                    <small>{contact.value}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="acc2-bio is-empty">Hisobga email, Google yoki Telegram bog‘lanmagan.</p>
        )}
      </section>

      <Dialog open={field !== null} onOpenChange={(open) => { if (!open) setField(null); }}>
        <DialogContent className="acc2-dialog">
          <DialogTitle>{field ? FIELD_TITLES[field] : ""}</DialogTitle>
          <DialogDescription>{field ? FIELD_HINTS[field] : ""}</DialogDescription>
          {field && (
            <form className="acc2-field-form" onSubmit={submitField}>
              {field === "gender" ? (
                <div className="acc2-choice" role="radiogroup" aria-label="Jins">
                  {([["male", GENDER_LABELS.male], ["female", GENDER_LABELS.female], ["", "Ko‘rsatmaslik"]] as const).map(([value, label]) => (
                    <label key={label} className={draft === value ? "is-on" : undefined}>
                      <input type="radio" name="gender" value={value} checked={draft === value} onChange={() => setDraft(value)} />
                      {label}
                    </label>
                  ))}
                </div>
              ) : field === "birthDate" ? (
                <input className="acc2-input" type="date" value={draft} min="1900-01-01" max={latestBirthDate()} onChange={(e) => setDraft(e.target.value)} aria-label="Tug‘ilgan sana" />
              ) : (
                <div className={`acc2-input-wrap${field === "username" ? " has-at" : ""}`}>
                  {field === "username" && <span aria-hidden="true">@</span>}
                  <input
                    className="acc2-input"
                    value={draft}
                    onChange={(e) => setDraft(field === "username" ? e.target.value.replace(/\s/g, "") : e.target.value)}
                    maxLength={field === "name" ? LIMITS.name : field === "profession" ? LIMITS.profession : 25}
                    autoComplete={field === "name" ? "name" : "off"}
                    autoCapitalize={field === "username" ? "none" : undefined}
                    spellCheck={field !== "username"}
                    autoFocus
                    aria-label={FIELD_TITLES[field]}
                  />
                </div>
              )}
              <div className="acc2-actions">
                <button type="button" className="acc2-ghost" onClick={() => setField(null)} disabled={busy !== null}>Bekor qilish</button>
                <button type="submit" className="acc2-primary" disabled={busy !== null}>{busy === "text" ? "Saqlanmoqda…" : "Saqlash"}</button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

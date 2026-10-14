"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Search, ShieldCheck, UserCheck, UserRound, Users } from "lucide-react";
import { fetchAdminSummary, fetchAdminUsers, updateUserRole } from "@/lib/api/roles-client";
import { USER_ROLES, USER_ROLE_LABELS, type AdminUser, type AdminUsersSummary, type UserRole } from "@/shared/contract/roles";

const PROVIDER_LABELS = { google: "Google", telegram: "Telegram", email: "Email" } as const;

type Kind = "registered" | "guests";

// Brauzer locale'iga bog'liq bo'lmasligi uchun sana qo'lda yoziladi: 14.10.2026.
const dateLabel = (value: string) => {
  const d = new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"));
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

export default function AdminPanel({ selfId }: { selfId: string }) {
  const [kind, setKind] = useState<Kind>("registered");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [summary, setSummary] = useState<AdminUsersSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const loadSummary = useCallback(() => {
    fetchAdminSummary().then(setSummary).catch(() => {});
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setStatus("loading");
      fetchAdminUsers(query, kind)
        .then((list) => { if (alive) { setUsers(list); setError(""); setStatus("ready"); } })
        .catch((e: Error) => { if (alive) { setError(e.message); setStatus("error"); } });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, kind]);

  async function change(user: AdminUser, role: UserRole) {
    if (role === user.role) return;
    setSaving(user.id);
    setError("");
    try {
      const updated = await updateUserRole(user.id, role);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      loadSummary();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const tiles = [
    { key: "registered", icon: UserCheck, value: summary?.registered, label: "Ro'yxatdan o'tgan", tone: "registered" },
    { key: "guests", icon: Users, value: summary?.guests, label: "Mehmon", tone: "guests" },
    { key: "moderators", icon: ShieldCheck, value: summary?.moderators, label: USER_ROLE_LABELS.moderator, tone: "role-moderator" },
    { key: "admins", icon: Crown, value: summary?.admins, label: USER_ROLE_LABELS.admin, tone: "role-admin" },
  ] as const;

  return (
    <div className="admin-panel">
      <div className="admin-counts">
        {tiles.map(({ key, icon: Icon, value, label, tone }) => (
          <span key={key} className={tone}><Icon size={15} /><b>{value ?? "–"}</b>{label}</span>
        ))}
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Foydalanuvchilar turi">
        <button role="tab" aria-selected={kind === "registered"} className={kind === "registered" ? "on" : ""} onClick={() => setKind("registered")}>
          Ro‘yxatdan o‘tganlar{summary ? ` · ${summary.registered}` : ""}
        </button>
        <button role="tab" aria-selected={kind === "guests"} className={kind === "guests" ? "on" : ""} onClick={() => setKind("guests")}>
          Mehmonlar{summary ? ` · ${summary.guests}` : ""}
        </button>
      </div>

      <p className="admin-hint">
        {kind === "registered"
          ? "Email, Google yoki Telegram bilan kirganlar. Rol faqat shularga beriladi."
          : "Hali ro‘yxatdan o‘tmaganlar. Ularga rol berib bo‘lmaydi; kirgach «Ro‘yxatdan o‘tganlar» bo‘limida chiqadi."}
      </p>

      <label className="admin-search">
        <Search size={17} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={kind === "registered" ? "Ism, email yoki ID bo'yicha qidirish" : "Ism yoki ID bo'yicha qidirish"} aria-label="Foydalanuvchini qidirish" />
      </label>

      {error && <p className="admin-error" role="alert">{error}</p>}
      {status === "loading" && <p className="admin-empty">Yuklanmoqda…</p>}
      {status === "ready" && users.length === 0 && <p className="admin-empty">{kind === "registered" ? "Ro‘yxatdan o‘tgan hech kim topilmadi." : "Mehmon topilmadi."}</p>}

      <ul className="admin-users">
        {users.map((user) => {
          const self = user.id === selfId;
          return (
            <li key={user.id}>
              <span className="admin-avatar">{user.name.slice(0, 1).toUpperCase() || "K"}</span>
              <span className="admin-user-info">
                <strong>{user.name}{self ? " (siz)" : ""}</strong>
                {user.registered ? (
                  <span className="admin-accounts">
                    {user.accounts.length
                      ? user.accounts.map((a) => (
                          <span key={`${a.provider}-${a.label}`} className={`admin-chip chip-${a.provider}`} title={a.label}>
                            <b>{PROVIDER_LABELS[a.provider]}</b> {a.label}
                          </span>
                        ))
                      : <span className="admin-chip">{USER_ROLE_LABELS[user.role]}</span>}
                  </span>
                ) : (
                  <small title={user.id}>{user.id.slice(0, 18)}… · {dateLabel(user.createdAt)}</small>
                )}
              </span>
              {user.registered && (
                <div className="admin-role-switch" role="radiogroup" aria-label={`${user.name} roli`}>
                  {USER_ROLES.map((role) => (
                    <button
                      key={role}
                      role="radio"
                      aria-checked={user.role === role}
                      className={user.role === role ? `on role-${role}` : ""}
                      disabled={self || saving === user.id}
                      onClick={() => change(user, role)}
                    >
                      {USER_ROLE_LABELS[role]}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

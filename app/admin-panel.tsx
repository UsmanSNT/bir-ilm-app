"use client";

import { useEffect, useState } from "react";
import { Crown, Search, ShieldCheck, UserRound } from "lucide-react";
import { fetchAdminUsers, updateUserRole } from "@/lib/api/roles-client";
import { USER_ROLES, USER_ROLE_LABELS, type AdminUser, type UserRole } from "@/shared/contract/roles";

const ROLE_ICONS = { user: UserRound, moderator: ShieldCheck, admin: Crown } as const;

export default function AdminPanel({ selfId }: { selfId: string }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      fetchAdminUsers(query)
        .then((list) => { if (alive) { setUsers(list); setStatus("ready"); } })
        .catch((e: Error) => { if (alive) { setError(e.message); setStatus("error"); } });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  async function change(user: AdminUser, role: UserRole) {
    if (role === user.role) return;
    setSaving(user.id);
    setError("");
    try {
      const updated = await updateUserRole(user.id, role);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const counts = USER_ROLES.map((role) => [role, users.filter((u) => u.role === role).length] as const);

  return (
    <div className="admin-panel">
      <p className="admin-intro">Foydalanuvchiga rol bering. Moderator jonli suhbatlarda so‘z beradi, izohlarni o‘chiradi va qatnashchini chiqaradi. Suhbatni e’lon qilish va boshlash faqat adminda.</p>

      <div className="admin-counts">
        {counts.map(([role, n]) => {
          const Icon = ROLE_ICONS[role];
          return <span key={role} className={`role-${role}`}><Icon size={15} /><b>{n}</b>{USER_ROLE_LABELS[role]}</span>;
        })}
      </div>

      <label className="admin-search">
        <Search size={17} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ism yoki ID bo'yicha qidirish" aria-label="Foydalanuvchini qidirish" />
      </label>

      {error && <p className="admin-error" role="alert">{error}</p>}
      {status === "loading" && <p className="admin-empty">Yuklanmoqda…</p>}
      {status === "ready" && users.length === 0 && <p className="admin-empty">Hech kim topilmadi.</p>}

      <ul className="admin-users">
        {users.map((user) => {
          const self = user.id === selfId;
          return (
            <li key={user.id}>
              <span className="admin-avatar">{user.name.slice(0, 1).toUpperCase() || "K"}</span>
              <span className="admin-user-info">
                <strong>{user.name}{self ? " (siz)" : ""}</strong>
                <small title={user.id}>{user.id.slice(0, 18)}…</small>
              </span>
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}

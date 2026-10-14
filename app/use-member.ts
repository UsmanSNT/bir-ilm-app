"use client";

import { useCallback, useEffect, useState } from "react";

export type AuthKind = "loading" | "visitor" | "signed_in" | "member";
export type Auth = {
  kind: AuthKind;
  name: string | null;
  suggestedName: string | null;
  admin: boolean;
  signInPath: string;
  register: (name: string) => Promise<void>;
};

type MeResponse = { kind?: "visitor" | "signed_in" | "member"; name?: string | null; suggestedName?: string | null; admin?: boolean; signInPath?: string };

const VISIT_KEY = "bir-visit-pinged";

// Session state for the current browser plus a once-per-tab anonymous visit ping.
export function useMember(): Auth {
  const [me, setMe] = useState<Omit<MeResponse, "kind"> & { kind: AuthKind }>({ kind: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/me", { signal: ctrl.signal })
      .then(r => r.ok ? r.json() as Promise<MeResponse> : Promise.reject(Error("me")))
      .then(next => setMe({ ...next, kind: next.kind ?? "visitor" }))
      .catch(() => { if (!ctrl.signal.aborted) setMe({ kind: "visitor" }); });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (me.kind === "loading" || me.kind === "member") return;
    try {
      if (sessionStorage.getItem(VISIT_KEY)) return;
      sessionStorage.setItem(VISIT_KEY, "1");
    } catch { /* Storage can be blocked; the server still de-duplicates reloads. */ }
    void fetch("/api/visit", { method: "POST" }).catch(() => {});
  }, [me.kind]);

  const register = useCallback(async (name: string) => {
    const response = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const result = await response.json().catch(() => ({})) as { error?: string; name?: string };
    if (!response.ok) throw Error(result.error || "Ro'yxatdan o'tish amalga oshmadi.");
    setMe(old => ({ ...old, kind: "member", name: result.name ?? name }));
  }, []);

  return {
    kind: me.kind,
    name: me.name ?? null,
    suggestedName: me.suggestedName ?? null,
    admin: Boolean(me.admin),
    signInPath: me.signInPath ?? "/signin-with-chatgpt?return_to=%2F",
    register,
  };
}

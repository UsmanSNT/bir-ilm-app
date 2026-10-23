/** Ijtimoiy tarmoq havolalari va qisqa videolar uchun REST yordamchilari va hook'lar. */
"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_ABOUT } from "@/shared/contract/about";
import type { AboutSettings, SiteLinks, SiteLinksInput, SiteVideo, TeamMember, TeamMemberInput, Wisdom, WisdomInput, WisdomToday, WisdomUpdate } from "@/shared/contract";
import { API_PREFIX } from "./config";

type Envelope<T> = { data?: T; error?: { message?: string; fields?: Record<string, string[]> } };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, { credentials: "include", cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || body.data === undefined) {
    // Validatsiya xatosida aniq maydon xabari umumiy xabardan foydaliroq.
    const field = body.error?.fields && Object.values(body.error.fields)[0]?.[0];
    throw new Error(field ?? body.error?.message ?? "So'rov bajarilmadi.");
  }
  return body.data;
}

export const SITE_CHANGED = "bir-site-changed";
export const notifySiteChanged = () => window.dispatchEvent(new Event(SITE_CHANGED));

/** Bir martalik yuklash; admin o'zgartirsa hamma joyda yangilanadi. */
function useRemote<T>(load: () => Promise<T>, initial: T): { value: T; loading: boolean } {
  const [state, setState] = useState({ value: initial, loading: true });
  const run = useCallback(() => { load().then((value) => setState({ value, loading: false })).catch(() => setState((s) => ({ ...s, loading: false }))); }, [load]);
  useEffect(() => {
    run();
    window.addEventListener(SITE_CHANGED, run);
    return () => window.removeEventListener(SITE_CHANGED, run);
  }, [run]);
  return state;
}

const loadLinks = () => call<SiteLinks>("/site/links");
const loadVideos = () => call<{ items: SiteVideo[] }>("/site/videos").then((d) => d.items);
const NO_LINKS: SiteLinks = {};
const NO_VIDEOS: SiteVideo[] = [];

const loadWisdom = () => call<WisdomToday>("/site/wisdom");
const NO_WISDOM: WisdomToday = { today: null, items: null };

export const useSiteLinks = () => useRemote(loadLinks, NO_LINKS);
/** Bugungi hikmat (admin uchun to'liq ro'yxat ham). Admin o'zgartirsa hamma joyda yangilanadi. */
export const useWisdom = () => useRemote(loadWisdom, NO_WISDOM);
export const useSiteVideos = () => useRemote(loadVideos, NO_VIDEOS);

export const saveSiteLinks = (input: SiteLinksInput) => call<SiteLinks>("/site/links", { method: "PUT", body: JSON.stringify(input) });
export const addSiteVideo = (url: string, title: string) => call<SiteVideo>("/site/videos", { method: "POST", body: JSON.stringify({ url, title }) });
export const removeSiteVideo = (id: string) => call<unknown>(`/site/videos/${encodeURIComponent(id)}`, { method: "DELETE" });

export const createWisdom = (input: WisdomInput) => call<Wisdom>("/site/wisdom", { method: "POST", body: JSON.stringify(input) });
export const updateWisdom = (id: string, input: WisdomUpdate) => call<Wisdom>(`/site/wisdom/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteWisdom = (id: string) => call<unknown>(`/site/wisdom/${encodeURIComponent(id)}`, { method: "DELETE" });

// ── Loyiha jamoasi va «Biz haqimizda» ───────────────────────────────

type TeamList = { items: TeamMember[] };
const items = (d: TeamList) => d.items;
const memberPath = (id: string) => `/site/team/${encodeURIComponent(id)}`;

const loadTeam = () => call<TeamList>("/site/team").then(items);
const NO_TEAM: TeamMember[] = [];
const loadAbout = () => call<AboutSettings>("/site/about");

/** Saytdagi jamoa (faqat ko'rinadiganlar). */
export const useTeam = () => useRemote(loadTeam, NO_TEAM);
/** Yuklanguncha standart qiymat: hisoblar darhol chiqadi, keyin kerak bo'lsa yangilanadi. */
export const useAbout = () => useRemote(loadAbout, DEFAULT_ABOUT);

export const fetchTeamAdmin = () => call<TeamList>("/site/team?all=1").then(items);
export const createTeamMember = (input: TeamMemberInput) => call<TeamList>("/site/team", { method: "POST", body: JSON.stringify(input) }).then(items);
export const updateTeamMember = (id: string, input: TeamMemberInput) => call<TeamList>(memberPath(id), { method: "PUT", body: JSON.stringify(input) }).then(items);
export const deleteTeamMember = (id: string) => call<TeamList>(memberPath(id), { method: "DELETE" }).then(items);
export const moveTeamMember = (id: string, direction: "up" | "down") => call<TeamList>(`${memberPath(id)}/move`, { method: "POST", body: JSON.stringify({ direction }) }).then(items);
export const uploadTeamPhoto = (id: string, file: Blob) => call<TeamList>(`${memberPath(id)}/photo`, { method: "POST", headers: { "Content-Type": file.type }, body: file }).then(items);
export const removeTeamPhoto = (id: string) => call<TeamList>(`${memberPath(id)}/photo`, { method: "DELETE" }).then(items);

export const saveAbout = (input: AboutSettings) => call<AboutSettings>("/site/about", { method: "PUT", body: JSON.stringify(input) });

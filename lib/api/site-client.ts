/** Ijtimoiy tarmoq havolalari va qisqa videolar uchun REST yordamchilari va hook'lar. */
"use client";

import { useCallback, useEffect, useState } from "react";
import type { SiteLinks, SiteLinksInput, SiteVideo } from "@/shared/contract";
import { API_PREFIX } from "./config";

type Envelope<T> = { data?: T; error?: { message?: string } };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, { credentials: "include", cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || body.data === undefined) throw new Error(body.error?.message ?? "So'rov bajarilmadi.");
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

export const useSiteLinks = () => useRemote(loadLinks, NO_LINKS);
export const useSiteVideos = () => useRemote(loadVideos, NO_VIDEOS);

export const saveSiteLinks = (input: SiteLinksInput) => call<SiteLinks>("/site/links", { method: "PUT", body: JSON.stringify(input) });
export const addSiteVideo = (url: string, title: string) => call<SiteVideo>("/site/videos", { method: "POST", body: JSON.stringify({ url, title }) });
export const removeSiteVideo = (id: string) => call<unknown>(`/site/videos/${encodeURIComponent(id)}`, { method: "DELETE" });

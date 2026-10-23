"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { DEFAULT_ABOUT, type AboutSettings } from "@/lib/about";
import { computeJourney, isValidAnchor, type Journey } from "@/lib/journey";

// Bir sahifada bir nechta komponent (lenta, panel, Biz haqimizda) bitta so'rovni bo'lishadi.
let request: Promise<AboutSettings> | null = null;

function loadAbout(): Promise<AboutSettings> {
  request ??= fetch("/api/about")
    .then((response) => (response.ok ? (response.json() as Promise<{ settings?: AboutSettings }>) : Promise.reject(new Error())))
    .then(({ settings }) => (settings && isValidAnchor(settings.anchor) ? settings : DEFAULT_ABOUT))
    .catch(() => {
      request = null;
      return DEFAULT_ABOUT;
    });
  return request;
}

/** Sozlamalar yuklanguncha null qaytaradi. */
export function useAboutSettings(): AboutSettings | null {
  const [settings, setSettings] = useState<AboutSettings | null>(null);
  useEffect(() => {
    let active = true;
    void loadAbout().then((value) => {
      if (active) setSettings(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return settings;
}

const subscribeClock = (onChange: () => void) => {
  const timer = setInterval(onChange, 15_000);
  return () => clearInterval(timer);
};
const minuteSnapshot = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverSnapshot = () => 0;

/** Daqiqa aniqligidagi joriy vaqt; har daqiqada bir marta yangilanadi. */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribeClock, minuteSnapshot, serverSnapshot);
}

export function useJourney(): { journey: Journey; settings: AboutSettings; loaded: boolean } {
  const loadedSettings = useAboutSettings();
  const now = useMinuteClock();
  const settings = loadedSettings ?? DEFAULT_ABOUT;
  const { number, date } = settings.anchor;
  const journey = useMemo(() => computeJourney({ number, date }, now), [number, date, now]);
  return { journey, settings, loaded: loadedSettings !== null };
}

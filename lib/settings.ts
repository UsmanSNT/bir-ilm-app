import { readStoredAbout, type AboutSettings } from "./about";

export const ABOUT_KEY = "about";

export async function loadAboutSettings(db: D1Database): Promise<AboutSettings> {
  const row = await db.prepare("SELECT value FROM site_settings WHERE key=?").bind(ABOUT_KEY).first<{ value: string }>();
  return readStoredAbout(row?.value);
}

export async function saveAboutSettings(db: D1Database, settings: AboutSettings): Promise<void> {
  await db
    .prepare("INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP")
    .bind(ABOUT_KEY, JSON.stringify(settings))
    .run();
}

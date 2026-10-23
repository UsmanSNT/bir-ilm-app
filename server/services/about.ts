/** «Biz haqimizda» sozlamalari: `site_settings` jadvalida bitta JSON qator. */
import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { readStoredAbout, type AboutSettings } from "@/shared/contract";

const { siteSettings } = schema;
const KEY = "about";

export async function getAbout(db: Database): Promise<AboutSettings> {
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, KEY), columns: { value: true } });
  return readStoredAbout(row?.value);
}

export async function saveAbout(db: Database, input: AboutSettings): Promise<AboutSettings> {
  const value = JSON.stringify(input);
  const updatedAt = new Date().toISOString();
  await db.insert(siteSettings).values({ key: KEY, value, updatedAt }).onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt } });
  return getAbout(db);
}

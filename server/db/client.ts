/**
 * D1 ulanishi.
 *
 * Binding'ni tashqaridan uzatish mumkin (`getDb(binding)`), shuning uchun
 * xizmat (service) qatlamini test qilganda haqiqiy Worker muhiti shart emas.
 */
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export { schema };

/** D1 binding yo'qligini bildiradigan xato — HTTP qatlami buni 503 ga o'giradi. */
export class DatabaseUnavailableError extends Error {
  constructor() {
    super("Ma'lumotlar bazasi hozircha ulanmagan.");
    this.name = "DatabaseUnavailableError";
  }
}

export function createDb(binding: D1Database): Database {
  return drizzle(binding, { schema });
}

/**
 * Worker muhitidagi `DB` binding'ini oladi. Binding topilmasa
 * `DatabaseUnavailableError` tashlaydi — chaqiruvchi uni ushlab, seed
 * ma'lumotga o'tishi yoki 503 qaytarishi mumkin.
 */
export async function getDb(binding?: D1Database): Promise<Database> {
  if (binding) return createDb(binding);

  const resolved = await resolveBinding();
  if (!resolved) throw new DatabaseUnavailableError();
  return createDb(resolved);
}

/** Binding mavjudligini xato tashlamasdan tekshiradi. */
export async function tryGetDb(binding?: D1Database): Promise<Database | null> {
  if (binding) return createDb(binding);
  const resolved = await resolveBinding();
  return resolved ? createDb(resolved) : null;
}

async function resolveBinding(): Promise<D1Database | null> {
  try {
    // `cloudflare:workers` faqat Worker ichida mavjud, shuning uchun dinamik
    // import — Node testlari bu modulni yuklaganda yiqilmasin.
    const { env } = await import("cloudflare:workers");
    return (env as { DB?: D1Database }).DB ?? null;
  } catch {
    return null;
  }
}

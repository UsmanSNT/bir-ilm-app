/** Kun hikmati: ro'yxat, bugungi hikmat va admin tahriri. */
import { and, asc, eq, ne } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ApiException, badRequest, notFound } from "@/server/http/errors";
import { WISDOM_LIMITS, wisdomDay, wisdomIndex, type Wisdom, type WisdomInput, type WisdomUpdate } from "@/shared/contract";

const { wisdoms } = schema;
const DEFAULT_AUTHOR = "Bir Ilm";

const toWisdom = (row: typeof wisdoms.$inferSelect): Wisdom => ({
  id: row.id,
  text: row.text,
  author: row.author,
  featuredOn: row.featuredOn ?? null,
  createdAt: row.createdAt,
});

export async function listWisdoms(db: Database): Promise<Wisdom[]> {
  const rows = await db.select().from(wisdoms).orderBy(asc(wisdoms.createdAt), asc(wisdoms.id));
  return rows.map(toWisdom);
}

/** Bugungi hikmat: admin shu kunga belgilagan bo'lsa — o'sha, aks holda navbatdagisi (hamma uchun bir xil). */
export function pickToday(items: Wisdom[], now = Date.now()): Wisdom | null {
  const day = wisdomDay(now);
  const featured = items.find((item) => item.featuredOn === day);
  if (featured) return featured;
  const index = wisdomIndex(items.length, now);
  return index >= 0 ? items[index] : null;
}

export async function getWisdom(db: Database, id: string): Promise<Wisdom | null> {
  const row = await db.query.wisdoms.findFirst({ where: eq(wisdoms.id, id) });
  return row ? toWisdom(row) : null;
}

/** 6 belgili kod (a-z, 0-9): qisqa va o'qilishi oson havola uchun. */
async function freshId(db: Database): Promise<string> {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const id = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    if (!(await db.query.wisdoms.findFirst({ where: eq(wisdoms.id, id), columns: { id: true } }))) return id;
  }
  throw new ApiException("internal_error", "Kod yaratib bo'lmadi. Qayta urining.", 500);
}

export async function createWisdom(db: Database, userId: string, input: WisdomInput): Promise<Wisdom> {
  const count = (await db.select({ id: wisdoms.id }).from(wisdoms)).length;
  if (count >= WISDOM_LIMITS.items) throw badRequest(`Hikmatlar ${WISDOM_LIMITS.items} tadan oshmasin: eskisini o'chiring.`);
  const stamp = new Date().toISOString();
  const [row] = await db
    .insert(wisdoms)
    .values({ id: await freshId(db), text: input.text, author: input.author || DEFAULT_AUTHOR, createdBy: userId, createdAt: stamp, updatedAt: stamp })
    .returning();
  return toWisdom(row);
}

export async function updateWisdom(db: Database, id: string, input: WisdomUpdate): Promise<Wisdom> {
  const before = await getWisdom(db, id);
  if (!before) throw notFound("Hikmat topilmadi.");
  const stamp = new Date().toISOString();
  const day = wisdomDay();
  const set: Partial<typeof wisdoms.$inferInsert> = { updatedAt: stamp };
  if (input.text !== undefined) set.text = input.text;
  if (input.author !== undefined) set.author = input.author || DEFAULT_AUTHOR;
  if (input.featureToday === true) set.featuredOn = day;
  if (input.featureToday === false && before.featuredOn === day) set.featuredOn = null;
  // Bir kunga faqat bitta hikmat belgilanadi.
  const statements = [db.update(wisdoms).set(set).where(eq(wisdoms.id, id))];
  if (input.featureToday === true) statements.unshift(db.update(wisdoms).set({ featuredOn: null }).where(and(eq(wisdoms.featuredOn, day), ne(wisdoms.id, id))));
  await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
  return (await getWisdom(db, id))!;
}

export async function deleteWisdom(db: Database, id: string): Promise<void> {
  if (!(await getWisdom(db, id))) throw notFound("Hikmat topilmadi.");
  await db.delete(wisdoms).where(eq(wisdoms.id, id));
}

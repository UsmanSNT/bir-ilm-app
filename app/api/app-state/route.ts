import { env } from "cloudflare:workers";
import { activeBookId, books, seedComments, seedLeaderboard } from "@/app/app-data";
import { corsHeaders, parseAllowedOrigins, preflightResponse } from "@/server/http/cors";

export const runtime = "edge";

function corsContext(request: Request) {
  return {
    origin: request.headers.get("origin"),
    selfOrigin: new URL(request.url).origin,
    allowed: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  };
}

/**
 * Javobga CORS sarlavhalarini qo'shadi.
 *
 * Native qobiq (`capacitor://localhost`) serverning o'z origini emas,
 * shuning uchun bu sarlavhalarsiz brauzer qatlami javobni bloklaydi.
 */
function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(corsContext(request))) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Native ilovalar uchun CORS preflight. */
export function OPTIONS(request: Request) {
  return preflightResponse(corsContext(request));
}

type ActivityPayload = {
  score?: number;
  streak?: number;
  activeDays?: number;
  comments?: number;
  books?: number;
  pages?: number;
};

type AppStatePayload = {
  type?: "comment" | "progress" | "profile";
  userId?: string;
  name?: string;
  text?: string;
  page?: number;
  total?: number;
  activity?: ActivityPayload;
};

type CommentRow = {
  id: number;
  name: string;
  text: string;
  demo: number;
  createdAt: string;
};

type LeaderboardRow = {
  id: string;
  name: string;
  pages: number;
  books: number;
  comments: number;
  streak: number;
  score: number;
};

function seedPayload(mode: "local" | "seed") {
  return {
    mode,
    activeBookId,
    books,
    comments: seedComments,
    leaderboard: seedLeaderboard,
  };
}

function cleanText(value: unknown, fallback: string, limit: number) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return (cleaned || fallback).slice(0, limit);
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function upsertUser(db: D1Database, userId: string, name: string) {
  await db
    .prepare(
      `INSERT INTO users (id, name, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(userId, name)
    .run();
}

async function upsertActivity(
  db: D1Database,
  userId: string,
  name: string,
  activity: ActivityPayload | undefined,
) {
  const score = boundedInt(activity?.score, 0, 0, 1_000_000);
  const streak = boundedInt(activity?.streak, 0, 0, 10_000);
  const activeDays = boundedInt(activity?.activeDays, 0, 0, 10_000);
  const comments = boundedInt(activity?.comments, 0, 0, 100_000);
  const booksFinished = boundedInt(activity?.books, 0, 0, 10_000);
  const pages = boundedInt(activity?.pages, 0, 0, 1_000_000);

  await db
    .prepare(
      `INSERT INTO user_activity (
         user_id, display_name, score, streak, active_days,
         comments_count, books_finished, pages_read, last_active_date, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         score = max(user_activity.score, excluded.score),
         streak = max(user_activity.streak, excluded.streak),
         active_days = max(user_activity.active_days, excluded.active_days),
         comments_count = max(user_activity.comments_count, excluded.comments_count),
         books_finished = max(user_activity.books_finished, excluded.books_finished),
         pages_read = max(user_activity.pages_read, excluded.pages_read),
         last_active_date = excluded.last_active_date,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      userId,
      name,
      score,
      streak,
      activeDays,
      comments,
      booksFinished,
      pages,
      todayKey(),
    )
    .run();
}

async function handleGet(): Promise<Response> {
  const db = env.DB;
  if (!db) return Response.json(seedPayload("local"));

  try {
    const commentRows = await db
      .prepare(
        `SELECT
           id,
           user_name AS name,
           body AS text,
           demo,
           created_at AS createdAt
         FROM comments
         WHERE book_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 60`,
      )
      .bind(activeBookId)
      .all<CommentRow>();

    const activityRows = await db
      .prepare(
        `SELECT
           user_id AS id,
           display_name AS name,
           pages_read AS pages,
           books_finished AS books,
           comments_count AS comments,
           streak,
           score
         FROM user_activity
         ORDER BY score DESC, streak DESC, pages_read DESC
         LIMIT 20`,
      )
      .all<LeaderboardRow>();

    const comments = (commentRows.results ?? [])
      .map((row) => ({
        id: row.id,
        name: row.name,
        text: row.text,
        demo: Boolean(row.demo),
        createdAt: row.createdAt,
      }))
      .reverse();

    const leaderboard = (activityRows.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      pages: row.pages,
      books: row.books,
      comments: row.comments,
      streak: row.streak,
      score: row.score,
      trend: "server",
    }));

    return Response.json({
      mode: "server",
      activeBookId,
      books,
      comments: comments.length ? comments : seedComments,
      leaderboard: leaderboard.length ? leaderboard : seedLeaderboard,
    });
  } catch {
    return Response.json(seedPayload("seed"));
  }
}

async function handlePost(request: Request): Promise<Response> {
  const db = env.DB;
  if (!db) {
    return Response.json(
      { error: "D1 bazasi hali ulanmagan. Ma'lumot qurilmada saqlanadi." },
      { status: 503 },
    );
  }

  let payload: AppStatePayload;
  try {
    payload = (await request.json()) as AppStatePayload;
  } catch {
    return Response.json({ error: "JSON noto'g'ri." }, { status: 400 });
  }

  const type = payload.type;
  const userId = cleanText(payload.userId, "anonymous", 96);
  if (userId.startsWith("reader_")) {
    return Response.json({ error: "Bu profil uchun ijtimoiy bo'limdan foydalaning." }, { status: 403 });
  }
  const name = cleanText(payload.name, "Kitobxon", 40);

  try {
    await upsertUser(db, userId, name);

    if (type === "comment") {
      const text = cleanText(payload.text, "", 2000);
      if (!text) {
        return Response.json({ error: "Izoh matni kerak." }, { status: 400 });
      }

      const result = await db
        .prepare(
          `INSERT INTO comments (book_id, user_id, user_name, body)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(activeBookId, userId, name, text)
        .run();

      await upsertActivity(db, userId, name, payload.activity);

      return Response.json(
        {
          comment: {
            id: Number(result.meta?.last_row_id ?? Date.now()),
            name,
            text,
            demo: false,
            createdAt: new Date().toISOString(),
          },
        },
        { status: 201 },
      );
    }

    if (type === "progress") {
      const total = boundedInt(payload.total, books[0]?.pages ?? 320, 1, 5000);
      const page = boundedInt(payload.page, 0, 0, total);

      await db
        .prepare(
          `INSERT INTO reading_progress (user_id, book_id, page, total, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id, book_id) DO UPDATE SET
             page = excluded.page,
             total = excluded.total,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(userId, activeBookId, page, total)
        .run();

      await upsertActivity(db, userId, name, payload.activity);
      return Response.json({ progress: { page, total } });
    }

    if (type === "profile") {
      await upsertActivity(db, userId, name, payload.activity);
      return Response.json({ profile: { userId, name } });
    }

    return Response.json({ error: "Noma'lum amal." }, { status: 400 });
  } catch {
    return Response.json(
      { error: "Backend yozuvi saqlanmadi. Keyinroq qayta urinib ko'ring." },
      { status: 500 },
    );
  }
}

// Mavjud mantiq o'zgarmadi; eksport qilingan ishlovchilar unga faqat CORS
// sarlavhalarini qo'shadi, shunda ayni shu API native ilovadan ham chaqiriladi.
export async function GET(request: Request): Promise<Response> {
  return withCors(request, await handleGet());
}

export async function POST(request: Request): Promise<Response> {
  return withCors(request, await handlePost(request));
}

/**
 * Yagona tipli API klient.
 *
 * Web, Android va iOS AYNAN shu klientni ishlatadi. Platformalar orasidagi
 * yagona farq — token qanday tashilishi:
 *   - web:    cookie (`credentials: "include"`)
 *   - native: `Authorization: Bearer <token>`
 *
 * UI kodi bu farqni bilmaydi.
 */
import {
  CLIENT_PLATFORM_HEADER,
  CLIENT_VERSION_HEADER,
  type ApiError,
  type ApiResponse,
  type Book,
  type BookComment,
  type ClientPlatform,
  type CreatePostInput,
  type CreateReplyInput,
  type ErrorCode,
  type FeedQuery,
  type FocusSessionInput,
  type FocusSummary,
  type FollowInput,
  type LeaderboardEntry,
  type Page,
  type Post,
  type ReaderProfile,
  type ReadingProgress,
  type Reply,
  type Session,
  type UpdateProfileInput,
  type UpdateProgressInput,
  type Viewer,
} from "@/shared/contract";
import {
  API_PREFIX,
  browserStorage,
  detectPlatform,
  noopStorage,
  resolveBaseUrl,
  type TokenStorage,
} from "./config";

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = "ApiClientError";
    this.code = error.code;
    this.status = status;
    this.fields = error.fields;
  }

  /** Tarmoq uzilgani yoki server yiqilganimi — qayta urinish mantiqiy. */
  get isRetryable(): boolean {
    return this.status >= 500 || this.code === "db_unavailable";
  }
}

export type ApiClientOptions = {
  /** Backend manzili. Berilmasa muhitdan aniqlanadi. */
  baseUrl?: string;
  platform?: ClientPlatform;
  /** Tokenni qayerda saqlash. Native uchun majburiy. */
  storage?: TokenStorage;
  /** Ilova versiyasi — serverda eski mijozlarni aniqlash uchun. */
  appVersion?: string;
  /** Testlar uchun `fetch` ni almashtirish. */
  fetchFn?: typeof fetch;
};

type RequestOptions = {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

export class ApiClient {
  private readonly baseUrl: string;
  private readonly platform: ClientPlatform;
  private readonly storage: TokenStorage;
  private readonly appVersion: string;
  private readonly fetchFn: typeof fetch;
  /** Bir vaqtda bir nechta so'rov sessiya ochmasin. */
  private sessionPromise: Promise<Session> | null = null;

  constructor(options: ApiClientOptions = {}) {
    this.platform = options.platform ?? detectPlatform();
    this.baseUrl = options.baseUrl ?? resolveBaseUrl(this.platform);
    this.storage =
      options.storage ?? (this.platform === "web" ? noopStorage() : browserStorage());
    this.appVersion = options.appVersion ?? "0.1.0";
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  // --- Sessiya -------------------------------------------------------------

  /**
   * Sessiyani kafolatlaydi. Web uchun cookie yetarli, native uchun token
   * saqlovdan o'qiladi yoki yangisi olinadi.
   */
  async ensureSession(): Promise<Session> {
    if (this.platform === "web") {
      return this.request<Session>("/auth/session", {
        method: "POST",
        body: { platform: this.platform, wantToken: false },
      });
    }

    const stored = await this.storage.get();
    if (stored) {
      return { userId: "", token: stored, expiresAt: "" };
    }

    this.sessionPromise ??= this.openNativeSession();
    try {
      return await this.sessionPromise;
    } finally {
      this.sessionPromise = null;
    }
  }

  private async openNativeSession(): Promise<Session> {
    const session = await this.request<Session>("/auth/session", {
      method: "POST",
      body: { platform: this.platform, wantToken: true },
    });

    if (session.token) await this.storage.set(session.token);
    return session;
  }

  /** Joriy foydalanuvchi. */
  viewer(): Promise<Viewer> {
    return this.request<Viewer>("/auth/session");
  }

  async signOut(): Promise<void> {
    await this.storage.clear();
  }

  // --- Ijtimoiy ------------------------------------------------------------

  feed(query: Partial<FeedQuery> = {}): Promise<Page<Post>> {
    return this.request<Page<Post>>("/feed", { query });
  }

  createPost(input: CreatePostInput): Promise<Post> {
    return this.request<Post>("/posts", { method: "POST", body: input });
  }

  deletePost(postId: string): Promise<Record<string, never>> {
    return this.request(`/posts/${encodeURIComponent(postId)}`, { method: "DELETE" });
  }

  createReply(postId: string, input: CreateReplyInput): Promise<Reply> {
    return this.request<Reply>(`/posts/${encodeURIComponent(postId)}/replies`, {
      method: "POST",
      body: input,
    });
  }

  profile(userId?: string): Promise<ReaderProfile & { isSelf: boolean; isFollowing: boolean; following: string[]; focus: FocusSummary | null }> {
    return this.request("/profile", { query: { userId } });
  }

  updateProfile(input: UpdateProfileInput): Promise<ReaderProfile> {
    return this.request<ReaderProfile>("/profile", { method: "PATCH", body: input });
  }

  readers(limit?: number): Promise<{ items: (ReaderProfile & { isFollowing: boolean })[] }> {
    return this.request("/readers", { query: { limit } });
  }

  follow(input: FollowInput): Promise<{ following: boolean }> {
    return this.request("/follows", { method: "POST", body: input });
  }

  focusSummary(): Promise<FocusSummary> {
    return this.request<FocusSummary>("/focus");
  }

  recordFocus(input: FocusSessionInput): Promise<FocusSummary> {
    return this.request<FocusSummary>("/focus", { method: "POST", body: input });
  }

  // --- Kutubxona -----------------------------------------------------------

  books(): Promise<{ items: Book[]; activeBookId: string | null }> {
    return this.request("/books");
  }

  comments(bookId: string, limit?: number): Promise<{ items: BookComment[] }> {
    return this.request(`/books/${encodeURIComponent(bookId)}/comments`, { query: { limit } });
  }

  createComment(bookId: string, body: string, name?: string): Promise<BookComment> {
    return this.request<BookComment>(`/books/${encodeURIComponent(bookId)}/comments`, {
      method: "POST",
      body: { body, name },
    });
  }

  progress(): Promise<{ items: ReadingProgress[] }> {
    return this.request("/progress");
  }

  saveProgress(input: UpdateProgressInput): Promise<ReadingProgress> {
    return this.request<ReadingProgress>("/progress", { method: "PUT", body: input });
  }

  leaderboard(limit?: number): Promise<{ items: LeaderboardEntry[]; viewerRank: number | null }> {
    return this.request("/leaderboard", { query: { limit } });
  }

  health(): Promise<{ status: string; version: string; database: string; time: string }> {
    return this.request("/health");
  }

  // --- Ichki qism ----------------------------------------------------------

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${API_PREFIX}${path}`, this.origin());

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    const headers = new Headers({
      [CLIENT_PLATFORM_HEADER]: this.platform,
      [CLIENT_VERSION_HEADER]: this.appVersion,
    });

    if (options.body !== undefined) headers.set("Content-Type", "application/json");

    // Native: tokenni sarlavhada yuboramiz. Web: cookie avtomatik ketadi.
    if (this.platform !== "web") {
      const token = await this.storage.get();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    let response: Response;
    try {
      response = await this.fetchFn(url.toString(), {
        method: options.method ?? "GET",
        headers,
        credentials: "include",
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ApiClientError(
        { code: "internal_error", message: "Internetga ulanib bo'lmadi." },
        0,
      );
    }

    return this.unwrap<T>(response);
  }

  private async unwrap<T>(response: Response): Promise<T> {
    let payload: ApiResponse<T>;
    try {
      payload = (await response.json()) as ApiResponse<T>;
    } catch {
      throw new ApiClientError(
        { code: "internal_error", message: "Serverdan noto'g'ri javob keldi." },
        response.status,
      );
    }

    if (payload.ok) return payload.data;
    throw new ApiClientError(payload.error, response.status);
  }

  /** Nisbiy manzilni `URL` ga aylantirish uchun asos. */
  private origin(): string {
    if (this.baseUrl.startsWith("http")) return this.baseUrl;

    const origin = globalThis.location?.origin;
    if (origin) return origin;

    // Serverda (RSC/SSR) `location` yo'q. Jim turib noto'g'ri manzilga
    // so'rov yuborgandan ko'ra, sababni aniq aytgan ma'qul.
    throw new Error(
      "ApiClient brauzer tomonida ishlatiladi. Serverda chaqirish kerak bo'lsa, " +
        "`apiClient({ baseUrl: \"https://...\" })` bilan to'liq manzil bering " +
        "yoki `server/services/` funksiyalarini to'g'ridan-to'g'ri chaqiring.",
    );
  }
}

/** Ilova bo'ylab bitta klient. */
let shared: ApiClient | null = null;

export function apiClient(options?: ApiClientOptions): ApiClient {
  if (options) return new ApiClient(options);
  shared ??= new ApiClient();
  return shared;
}

/**
 * Umumiy klientni sozlaydi va o'sha nusxani qaytaradi.
 *
 * Native qobiq ishga tushganda, birinchi `apiClient()` chaqiruvidan OLDIN
 * chaqiriladi — shunda butun UI tokenni xavfsiz saqlovdan oladigan bir xil
 * klientdan foydalanadi.
 */
export function configureApiClient(options: ApiClientOptions): ApiClient {
  shared = new ApiClient(options);
  return shared;
}

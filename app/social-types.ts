import type { UserRole } from "@/shared/contract/roles";
import type { Doc, MediaItem, PostFormat, ReactionCount } from "@/shared/contract/community";

export type Reader = { id: string; name: string; bio: string; posts: number; followers: number };
export type PostReply = { id: string; postId: string; userId: string; name: string; body: string; createdAt: string };
export type ReadingPost = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Qaysi kitob haqida (ixtiyoriy). */
  book: string;
  /** Matnli nusxa; maqolada lentada faqat boshi keladi. */
  body: string;
  kind: "post" | "announcement";
  format: PostFormat;
  /** Maqola / e'lon sarlavhasi. */
  title: string;
  /** Formatlangan matn. null — eski post (body ko'rsatiladi) yoki lentadagi maqola (`truncated`). */
  content: Doc | null;
  /** Lentadagi maqola: to'liq matn `?post=<id>` bilan olinadi. */
  truncated: boolean;
  readMinutes: number;
  /** Post rasmlari/videolari (albom + matn ichidagilar). */
  media: MediaItem[];
  /** Tepadagi albom — `media` ichidagi ID lar, tartib bilan. */
  attachments: string[];
  reactions: ReactionCount[];
  myReaction: string | null;
  editedAt: string | null;
  createdAt: string;
  replies: PostReply[];
  /** Faqat moderator/admin uchun to'ldiriladi. */
  reports: number;
};
export type SocialData = {
  userId: string;
  role: UserRole;
  /** Ro'yxatdan o'tgan (Google/Telegram yoki admin/moderator) — yoza oladi. */
  signedIn: boolean;
  posts: ReadingPost[];
  readers: Reader[];
  following: string[];
  followers: number;
  focusMinutes: number;
  sessions: number;
  profile: Reader | null;
  authorProfile: Reader | null;
  /** Ko'rib chiqilmagan shikoyatli postlar soni (moderator/admin). */
  reportedPosts: number;
};

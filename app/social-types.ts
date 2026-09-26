import type { UserRole } from "@/shared/contract/roles";

export type Reader = { id: string; name: string; bio: string; posts: number; followers: number };
export type PostReply = { id: string; postId: string; userId: string; name: string; body: string; createdAt: string };
export type ReadingPost = {
  id: string;
  userId: string;
  name: string;
  book: string;
  body: string;
  kind: "post" | "announcement";
  createdAt: string;
  replies: PostReply[];
  /** Faqat moderator/admin uchun to'ldiriladi. */
  reports: number;
};
export type SocialData = {
  userId: string;
  role: UserRole;
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

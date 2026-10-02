export type Reader = { id: string; name: string; bio: string; posts: number; followers: number };
export type PostReply = { id: string; postId: string; name: string; body: string; createdAt: string };
export const postKinds = ["review", "quote", "recommendation"] as const;
export type PostKind = (typeof postKinds)[number];
export type ReadingPost = { id: string; userId: string; name: string; book: string; body: string; kind: PostKind; createdAt: string; likes: number; liked: boolean; replies: PostReply[] };
export type SocialData = {
  userId: string;
  posts: ReadingPost[];
  readers: Reader[];
  following: string[];
  followers: number;
  focusMinutes: number;
  sessions: number;
  profile: Reader | null;
  authorProfile: Reader | null;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  summary: string;
  color: string;
  pages: number;
};

export type CommunityComment = {
  id: number;
  name: string;
  text: string;
  demo?: boolean;
  createdAt?: string;
};

export type LeaderboardMember = {
  id: string;
  name: string;
  pages: number;
  books: number;
  comments: number;
  streak: number;
  score: number;
  trend: string;
};

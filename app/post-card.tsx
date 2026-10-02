"use client";

import { useState } from "react";
import { BookOpen, Heart, MessageCircle, Pencil, Quote, Send, Sparkles, Trash2, UserCheck, UserPlus } from "lucide-react";
import { books } from "./app-data";
import type { PostKind, ReadingPost } from "./social-types";

export const kindLabels: Record<PostKind, string> = { review: "Taassurot", quote: "Iqtibos", recommendation: "Tavsiya" };

const palette = ["#0f4f45", "#294256", "#b66c5f", "#6150cf", "#8a6d1f", "#4a5d3a"];
// Katalogdagi kitob bo'lsa uning rangi, aks holda nomdan barqaror rang olinadi.
export function bookColor(title: string) {
  const found = books.find(b => b.title.toLocaleLowerCase() === title.trim().toLocaleLowerCase());
  if (found) return found.color;
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

// Brauzerlarda "uz-UZ" oy nomlari bir xil emas (Chromium "M10" chiqaradi), shuning uchun qo'lda.
const months = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const postDate = (value: string) => {
  const date = new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"));
  return Number.isNaN(date.getTime()) ? "" : `${date.getDate()}-${months[date.getMonth()]}`;
};

type Props = {
  post: ReadingPost; meId: string; following: boolean; busy: boolean; replyOpen: boolean; draft: string;
  onAuthor: () => void; onToggleReplies: () => void; onDraft: (value: string) => void;
  onAction: (payload: Record<string, unknown>, done?: () => void) => void;
};

export default function PostCard({ post, meId, following, busy, replyOpen, draft, onAuthor, onToggleReplies, onDraft, onAction }: Props) {
  const mine = post.userId === meId;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBook, setEditBook] = useState(post.book);
  const [editBody, setEditBody] = useState(post.body);
  const KindIcon = post.kind === "quote" ? Quote : post.kind === "recommendation" ? Sparkles : BookOpen;

  return <article className="reading-post ig-post">
    <header className="post-header">
      <span className="reader-avatar" aria-hidden="true">{post.name.slice(0, 1).toUpperCase()}</span>
      <div className="post-author"><button className="author-link" onClick={onAuthor}>{post.name}{mine ? " (siz)" : ""}</button><time dateTime={post.createdAt}>{postDate(post.createdAt)} · {kindLabels[post.kind]}</time></div>
      {!mine
        ? <button className="follow-button" disabled={busy || !meId} aria-pressed={following} onClick={() => onAction({ type: "follow", target: post.userId, follow: !following })}>
            {following ? <UserCheck size={17} /> : <UserPlus size={17} />}{following ? "Obunadasiz" : "Obuna"}</button>
        : <div className="post-owner-actions">
            <button className="icon-btn" title="Tahrirlash" aria-label="Postni tahrirlash" disabled={busy} onClick={() => setEditing(v => !v)}><Pencil size={17} /></button>
            <button className="icon-btn" title="O'chirish" aria-label="Postni o'chirish" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={17} /></button>
          </div>}
    </header>

    <div className={`ig-media kind-${post.kind}`} style={{ backgroundColor: bookColor(post.book) }}>
      <span className="ig-kind"><KindIcon size={15} />{kindLabels[post.kind]}</span>
      {post.kind === "quote" ? <blockquote>{post.body}</blockquote> : <strong>{post.book}</strong>}
      <small>{post.kind === "quote" ? `— ${post.book}` : ""}</small>
    </div>

    <div className="ig-actions">
      <button className={`ig-like ${post.liked ? "is-liked" : ""}`} aria-pressed={post.liked} aria-label={post.liked ? "Yoqtirishni olib tashlash" : "Yoqtirish"} disabled={busy || !meId} onClick={() => onAction({ type: "like", postId: post.id, like: !post.liked })}><Heart size={24} fill={post.liked ? "currentColor" : "none"} /></button>
      <button aria-expanded={replyOpen} aria-label="Fikrlar" onClick={onToggleReplies}><MessageCircle size={24} /></button>
    </div>
    <div className="ig-likes">{post.likes} ta yoqtirish</div>

    {editing
      ? <form className="post-compose" onSubmit={e => { e.preventDefault(); onAction({ type: "edit", postId: post.id, book: editBook, body: editBody }, () => setEditing(false)); }}>
          <input aria-label="Kitob nomi" maxLength={160} required value={editBook} onChange={e => setEditBook(e.target.value)} />
          <textarea aria-label="Post matni" maxLength={2000} rows={4} required value={editBody} onChange={e => setEditBody(e.target.value)} />
          <div className="compose-footer"><button type="button" className="text-btn" onClick={() => setEditing(false)}>Bekor qilish</button><button className="button" disabled={busy || !editBook.trim() || !editBody.trim()}>Saqlash</button></div>
        </form>
      : post.kind !== "quote" && <p className="post-body"><strong>{post.name}</strong> {post.body}</p>}

    {confirmDelete && <div className="delete-confirm"><span>Post va izohlar o&apos;chirilsinmi?</span><button className="text-btn" disabled={busy} onClick={() => onAction({ type: "delete", postId: post.id }, () => setConfirmDelete(false))}>O&apos;chirish</button><button className="text-btn" onClick={() => setConfirmDelete(false)}>Bekor qilish</button></div>}

    <button className="reply-toggle" aria-expanded={replyOpen} onClick={onToggleReplies}>{post.replies.length ? `${post.replies.length} ta fikrni ko'rish` : "Fikr bildirish"}</button>
    {replyOpen && <div className="post-replies">
      {post.replies.map(reply => <div className="post-reply" key={reply.id}><strong>{reply.name}</strong><p>{reply.body}</p></div>)}
      <form className="reply-form" onSubmit={e => { e.preventDefault(); onAction({ type: "reply", postId: post.id, body: draft }, () => onDraft("")); }}>
        <textarea aria-label={`${post.name} postiga izoh`} placeholder="Siz qanday fikrdasiz?" rows={2} maxLength={1000} required value={draft} onChange={e => onDraft(e.target.value)} />
        <button className="icon-btn" title="Izoh yuborish" aria-label="Izoh yuborish" disabled={busy || !draft.trim()}><Send size={19} /></button>
      </form>
    </div>}
  </article>;
}

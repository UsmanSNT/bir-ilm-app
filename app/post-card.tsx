"use client";

import { useRef, useState } from "react";
import { BookOpen, Heart, MessageCircle, Pencil, Quote, Sparkles, Trash2, UserCheck, UserPlus } from "lucide-react";
import DesignCard from "./design-card";
import { books } from "./app-data";
import { mediaUrl } from "./media-rules";
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
  const [expanded, setExpanded] = useState(false);
  const [burst, setBurst] = useState(false);
  const lastTap = useRef(0);
  const KindIcon = post.kind === "quote" ? Quote : post.kind === "recommendation" ? Sparkles : BookOpen;
  const legacyQuote = !post.design && !post.mediaKey && post.kind === "quote";

  const like = (value: boolean) => { if (!busy && meId) onAction({ type: "like", postId: post.id, like: value }); };
  // Instagramdagi kabi: mediani ikki marta bosish — yoqtirish.
  const onMediaTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 320) { if (!post.liked) like(true); setBurst(true); setTimeout(() => setBurst(false), 700); }
    lastTap.current = now;
  };

  let media;
  if (post.mediaKey && post.mediaType === "video") media = <video className="ig-media-el" src={mediaUrl(post.mediaKey)} controls playsInline preload="metadata" />;
  // eslint-disable-next-line @next/next/no-img-element -- foydalanuvchi media fayli o'z API'mizdan; Workers'da next/image optimizatori yo'q
  else if (post.mediaKey) media = <img className="ig-media-el" src={mediaUrl(post.mediaKey)} alt={post.body ? post.body.slice(0, 120) : `${post.name} posti`} loading="lazy" decoding="async" />;
  else if (post.design) media = <DesignCard design={post.design} />;
  else media = <div className={`ig-legacy kind-${post.kind}`} style={{ backgroundColor: bookColor(post.book) }}>
    <span className="ig-kind"><KindIcon size={15} />{kindLabels[post.kind]}</span>
    {legacyQuote ? <blockquote>{post.body}</blockquote> : <strong>{post.book}</strong>}
    {legacyQuote && <small>— {post.book}</small>}
  </div>;

  const caption = legacyQuote ? "" : post.body;
  const long = caption.length > 140;

  return <article className="ig-post">
    <header className="ig-head">
      <button className="ig-avatar" onClick={onAuthor} aria-label={`${post.name} sahifasi`}><span>{post.name.slice(0, 1).toUpperCase()}</span></button>
      <div className="ig-head-text">
        <button className="ig-name" onClick={onAuthor}>{post.name}{mine ? " · siz" : ""}</button>
        <span className="ig-sub">{post.book ? <><BookOpen size={12} />{post.book} · </> : null}{kindLabels[post.kind]} · {postDate(post.createdAt)}</span>
      </div>
      {!mine
        ? <button className={`ig-follow ${following ? "is-on" : ""}`} disabled={busy || !meId} aria-pressed={following} onClick={() => onAction({ type: "follow", target: post.userId, follow: !following })}>
            {following ? <UserCheck size={15} /> : <UserPlus size={15} />}{following ? "Obunadasiz" : "Obuna"}</button>
        : <div className="ig-owner">
            <button aria-label="Postni tahrirlash" title="Tahrirlash" disabled={busy} onClick={() => setEditing(v => !v)}><Pencil size={17} /></button>
            <button aria-label="Postni o'chirish" title="O'chirish" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={17} /></button>
          </div>}
    </header>

    <div className="ig-media" onClick={onMediaTap}>
      {media}
      {burst && <Heart className="ig-burst" size={96} fill="currentColor" aria-hidden="true" />}
    </div>

    <div className="ig-bar">
      <button className={`ig-like ${post.liked ? "is-liked" : ""}`} aria-pressed={post.liked} aria-label={post.liked ? "Yoqtirishni olib tashlash" : "Yoqtirish"} disabled={busy || !meId} onClick={() => like(!post.liked)}><Heart size={26} fill={post.liked ? "currentColor" : "none"} /></button>
      <button aria-expanded={replyOpen} aria-label="Fikrlar" onClick={onToggleReplies}><MessageCircle size={26} /></button>
    </div>
    {post.likes > 0 && <div className="ig-likes">{post.likes} ta yoqtirish</div>}

    {editing
      ? <form className="post-compose ig-edit" onSubmit={e => { e.preventDefault(); onAction({ type: "edit", postId: post.id, book: editBook, body: editBody }, () => setEditing(false)); }}>
          <input aria-label="Kitob nomi" maxLength={160} value={editBook} onChange={e => setEditBook(e.target.value)} placeholder="Kitob nomi" />
          <textarea aria-label="Izoh" maxLength={2000} rows={4} value={editBody} onChange={e => setEditBody(e.target.value)} />
          <div className="compose-footer"><button type="button" className="text-btn" onClick={() => setEditing(false)}>Bekor qilish</button><button className="button" disabled={busy}>Saqlash</button></div>
        </form>
      : caption && <p className={`ig-caption ${long && !expanded ? "is-clamped" : ""}`}><button className="ig-name" onClick={onAuthor}>{post.name}</button> {caption}</p>}
    {!editing && long && !expanded && <button className="ig-more" onClick={() => setExpanded(true)}>ko‘proq</button>}

    {confirmDelete && <div className="delete-confirm"><span>Post o&apos;chirilsinmi?</span><button className="text-btn" disabled={busy} onClick={() => onAction({ type: "delete", postId: post.id }, () => setConfirmDelete(false))}>O&apos;chirish</button><button className="text-btn" onClick={() => setConfirmDelete(false)}>Bekor qilish</button></div>}

    {post.replies.length > 0 && !replyOpen && <button className="ig-more" onClick={onToggleReplies}>{post.replies.length} ta fikrni ko‘rish</button>}
    {replyOpen && post.replies.length > 0 && <ul className="ig-replies">{post.replies.map(r => <li key={r.id}><strong>{r.name}</strong> {r.body}</li>)}</ul>}
    <form className="ig-reply" onSubmit={e => { e.preventDefault(); if (draft.trim()) onAction({ type: "reply", postId: post.id, body: draft }, () => onDraft("")); }}>
      <input aria-label={`${post.name} postiga fikr`} placeholder="Fikr qo‘shing..." maxLength={1000} value={draft} onChange={e => onDraft(e.target.value)} onFocus={() => { if (!replyOpen) onToggleReplies(); }} />
      <button disabled={busy || !draft.trim()}>Yuborish</button>
    </form>
  </article>;
}

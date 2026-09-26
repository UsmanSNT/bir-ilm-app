"use client";

/**
 * Lentadagi post kartasi, to'liq o'qish oynasi, reaksiyalar va ulashish.
 */
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import {
  BookOpen, Clock, Copy, Flag, Megaphone, MessageCircle, MoreHorizontal, Pencil, Send, Share2, SmilePlus, Trash2, UserCheck, UserPlus, X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { absoluteUrl, detectPlatform, resolveBaseUrl } from "@/lib/api/config";
import { REACTIONS, type ReactionCount } from "@/shared/contract/community";
import type { ReadingPost } from "../social-types";
import { MediaAlbum, RichContent } from "./rich-text";

export type PostActions = {
  viewerId: string;
  signedIn: boolean;
  moderator: boolean;
  following: string[];
  busy: boolean;
  requireLogin: (reason: string) => void;
  openPost: (post: ReadingPost) => void;
  openAuthor: (userId: string) => void;
  follow: (userId: string, follow: boolean) => void;
  react: (post: ReadingPost, emoji: string | null) => void;
  reply: (postId: string, body: string) => Promise<boolean>;
  deleteReply: (replyId: string) => void;
  edit: (post: ReadingPost) => void;
  remove: (post: ReadingPost) => void;
  report: (post: ReadingPost, reason: string) => void;
  dismissReports: (post: ReadingPost) => void;
};

export function parseDate(value: string): Date {
  return new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"));
}

// Ko'p brauzerlarda o'zbekcha oy nomlari yo'q ("M09" chiqadi) — o'zimiz yozamiz.
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

function formatDate(value: string, long = false): string {
  const date = parseDate(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (!long && minutes < 60) return minutes <= 1 ? "hozirgina" : `${minutes} daqiqa oldin`;
  if (!long && minutes < 24 * 60) return `${Math.round(minutes / 60)} soat oldin`;
  const year = date.getFullYear() !== new Date().getFullYear() ? ` ${date.getFullYear()}-yil` : "";
  return `${date.getDate()}-${MONTHS[date.getMonth()]}${year}`;
}

// ── Ulashish ────────────────────────────────────────────────────────

export function shareUrl(postId: string): string {
  const base = detectPlatform() === "web" ? window.location.origin : resolveBaseUrl();
  return `${base}/p/${postId}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    // navigator.clipboard faqat HTTPS'da bor; oddiy HTTP uchun eski usul.
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // pastdagi usulga o'tamiz
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  return ok;
}

function postTitle(post: ReadingPost): string {
  return post.title || (post.book ? `${post.name} · ${post.book}` : `${post.name} — Bir Ilm`);
}

export function ShareButton({ post, compact = false }: { post: ReadingPost; compact?: boolean }) {
  const url = shareUrl(post.id);
  const text = postTitle(post);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="post-action" aria-label="Ulashish" title="Ulashish">
          <Share2 size={18} />{!compact && <span>Ulashish</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="post-menu">
        <DropdownMenuItem onSelect={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, "_blank", "noopener")}>
          <Send size={16} />Telegram orqali
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copyText(url).then((ok) => (ok ? toast.success("Havola nusxalandi") : toast.error(url)))}>
          <Copy size={16} />Havolani nusxalash
        </DropdownMenuItem>
        {canShare && (
          <DropdownMenuItem onSelect={() => void navigator.share({ title: text, text: post.body.slice(0, 140), url }).catch(() => {})}>
            <Share2 size={16} />Boshqa ilovaga…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Reaksiyalar ─────────────────────────────────────────────────────

export function ReactionBar({ post, actions }: { post: ReadingPost; actions: PostActions }) {
  const [open, setOpen] = useState(false);
  const pick = (emoji: string) => {
    setOpen(false);
    if (!actions.signedIn) return actions.requireLogin("Reaksiya bildirish uchun kiring.");
    actions.react(post, post.myReaction === emoji ? null : emoji);
  };
  return (
    <div className="reaction-bar">
      {post.reactions.map((r: ReactionCount) => (
        <button
          type="button"
          key={r.emoji}
          className={`reaction-chip${post.myReaction === r.emoji ? " is-mine" : ""}`}
          aria-pressed={post.myReaction === r.emoji}
          aria-label={`${r.emoji} ${r.count}`}
          onClick={() => pick(r.emoji)}
        >
          <span className="reaction-emoji">{r.emoji}</span>{r.count}
        </button>
      ))}
      <Popover open={open} onOpenChange={(next) => {
        if (next && !actions.signedIn) return actions.requireLogin("Reaksiya bildirish uchun kiring.");
        setOpen(next);
      }}>
        <PopoverTrigger asChild>
          <button type="button" className="reaction-add" aria-label="Reaksiya qo'shish" title="Reaksiya"><SmilePlus size={18} /></button>
        </PopoverTrigger>
        <PopoverContent className="reaction-picker" align="start" side="top">
          {REACTIONS.map((emoji) => (
            <button type="button" key={emoji} className={post.myReaction === emoji ? "is-mine" : ""} onClick={() => pick(emoji)} aria-label={emoji}>{emoji}</button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Izohlar ─────────────────────────────────────────────────────────

function Replies({ post, actions }: { post: ReadingPost; actions: PostActions }) {
  const [draft, setDraft] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    if (await actions.reply(post.id, draft)) setDraft("");
  };
  return (
    <div className="post-replies">
      {post.replies.map((reply) => (
        <div className="post-reply" key={reply.id}>
          <span className="reader-avatar small" aria-hidden="true">{reply.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{reply.name}</strong> <time dateTime={reply.createdAt}>{formatDate(reply.createdAt)}</time>
            <p>{reply.body}</p>
          </div>
          {(reply.userId === actions.viewerId || actions.moderator) && (
            <button type="button" className="icon-btn reply-delete" title="Izohni o'chirish" aria-label="Izohni o'chirish" disabled={actions.busy} onClick={() => actions.deleteReply(reply.id)}><Trash2 size={14} /></button>
          )}
        </div>
      ))}
      {actions.signedIn ? (
        <form className="reply-form" onSubmit={(e) => void submit(e)}>
          <textarea aria-label={`${post.name} postiga izoh`} placeholder="Izoh yozing…" rows={1} maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit(e); }} />
          <button className="icon-btn" title="Yuborish" aria-label="Izoh yuborish" disabled={actions.busy || !draft.trim()}><Send size={19} /></button>
        </form>
      ) : (
        <button type="button" className="text-btn reply-login" onClick={() => actions.requireLogin("Izoh yozish uchun kiring.")}>Izoh yozish uchun kiring</button>
      )}
    </div>
  );
}

// ── Post sarlavhasi (muallif, menyu) ────────────────────────────────

function PostHeader({ post, actions }: { post: ReadingPost; actions: PostActions }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mine = post.userId === actions.viewerId;
  const following = actions.following.includes(post.userId);
  return (
    <>
      <header className="post-header">
        <button type="button" className="reader-avatar" onClick={() => actions.openAuthor(post.userId)} aria-label={`${post.name} postlari`}>
          {post.avatarUrl ? <img src={absoluteUrl(post.avatarUrl)} alt="" referrerPolicy="no-referrer" /> : post.name.slice(0, 1).toUpperCase()}
        </button>
        <div className="post-author">
          <button type="button" className="author-link" onClick={() => actions.openAuthor(post.userId)}>{post.name}{mine ? " (siz)" : ""}</button>
          <span className="post-meta">
            <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
            {post.editedAt && <span> · tahrirlangan</span>}
          </span>
        </div>
        {!mine && actions.viewerId && (
          <button type="button" className="follow-button" disabled={actions.busy} aria-pressed={following} onClick={() => actions.follow(post.userId, !following)}>
            {following ? <UserCheck size={16} /> : <UserPlus size={16} />}<span>{following ? "Obunadasiz" : "Obuna"}</span>
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="icon-btn" aria-label="Post amallari" title="Amallar"><MoreHorizontal size={19} /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="post-menu">
            {mine && <DropdownMenuItem onSelect={() => actions.edit(post)}><Pencil size={16} />Tahrirlash</DropdownMenuItem>}
            {(mine || actions.moderator) && <DropdownMenuItem className="is-danger" onSelect={() => setConfirmDelete(true)}><Trash2 size={16} />O&apos;chirish</DropdownMenuItem>}
            {!mine && <DropdownMenuItem onSelect={() => { setReason(""); setReporting(true); }}><Flag size={16} />Shikoyat qilish</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => void copyText(shareUrl(post.id)).then((ok) => ok && toast.success("Havola nusxalandi"))}><Copy size={16} />Havolani nusxalash</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {post.kind === "announcement" && <div className="post-badge"><Megaphone size={14} />E&apos;lon</div>}
      {actions.moderator && post.reports > 0 && (
        <div className="post-reports"><Flag size={14} />{post.reports} ta shikoyat
          <button type="button" className="text-btn" disabled={actions.busy} onClick={() => actions.dismissReports(post)}>Shikoyatni yopish</button>
        </div>
      )}
      {confirmDelete && (
        <div className="delete-confirm">
          <span>{mine ? "Post, rasmlar va izohlar o'chirilsinmi?" : "Moderator sifatida bu postni o'chirasizmi?"}</span>
          <button type="button" className="text-btn" disabled={actions.busy} onClick={() => { setConfirmDelete(false); actions.remove(post); }}>O&apos;chirish</button>
          <button type="button" className="text-btn" onClick={() => setConfirmDelete(false)}>Bekor qilish</button>
        </div>
      )}
      {reporting && (
        <form className="delete-confirm report-form" onSubmit={(e) => { e.preventDefault(); setReporting(false); actions.report(post, reason); }}>
          <input aria-label="Shikoyat sababi" placeholder="Sabab (ixtiyoriy): haqorat, spam..." maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          <button className="text-btn" disabled={actions.busy}>Yuborish</button>
          <button type="button" className="text-btn" onClick={() => setReporting(false)}>Bekor qilish</button>
        </form>
      )}
    </>
  );
}

function albumOf(post: ReadingPost) {
  return post.attachments.flatMap((id) => post.media.filter((item) => item.id === id));
}

// ── Lentadagi karta ─────────────────────────────────────────────────

export function PostCard({ post, actions }: { post: ReadingPost; actions: PostActions }) {
  const [showReplies, setShowReplies] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const album = albumOf(post);

  useLayoutEffect(() => {
    const el = body.current;
    if (!el || expanded) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 4);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, post.content, post.body]);

  const footer = (
    <div className="post-footer">
      <ReactionBar post={post} actions={actions} />
      <div className="post-footer-actions">
        <button type="button" className="post-action" aria-expanded={showReplies} onClick={() => setShowReplies((v) => !v)}>
          <MessageCircle size={18} /><span>{post.replies.length || ""}</span>
        </button>
        <ShareButton post={post} compact />
      </div>
    </div>
  );

  if (post.format === "article") {
    const cover = album.find((item) => item.kind === "image") ?? album[0];
    return (
      <article className={`reading-post is-article${post.kind === "announcement" ? " is-announcement" : ""}`}>
        <PostHeader post={post} actions={actions} />
        <button type="button" className="article-card" onClick={() => actions.openPost(post)}>
          {cover && (
            <span className="article-cover">
              {cover.kind === "video"
                ? <video src={`${absoluteUrl(cover.url)}#t=0.1`} muted playsInline preload="metadata" />
                : <img src={absoluteUrl(cover.url)} alt="" loading="lazy" />}
            </span>
          )}
          <span className="article-kicker"><BookOpen size={14} />MAQOLA{post.book ? ` · ${post.book}` : ""}</span>
          <strong className="article-title">{post.title}</strong>
          {post.body && <span className="article-excerpt">{post.body}</span>}
          <span className="article-read"><Clock size={15} />{post.readMinutes} daqiqa · O&apos;qish</span>
        </button>
        {footer}
        {showReplies && <Replies post={post} actions={actions} />}
      </article>
    );
  }

  return (
    <article className={`reading-post${post.kind === "announcement" ? " is-announcement" : ""}`}>
      <PostHeader post={post} actions={actions} />
      {post.title && <h3 className="post-title">{post.title}</h3>}
      <MediaAlbum items={album} />
      <div ref={body} className={`post-text${expanded ? "" : " is-clamped"}`}>
        <RichContent doc={post.content} text={post.body} media={post.media} />
      </div>
      {clamped && !expanded && <button type="button" className="text-btn post-more" onClick={() => setExpanded(true)}>Ko&apos;proq o&apos;qish</button>}
      {post.book && <div className="post-book"><BookOpen size={15} /><span>{post.book}</span></div>}
      {footer}
      {showReplies && <Replies post={post} actions={actions} />}
    </article>
  );
}

// ── To'liq o'qish oynasi ────────────────────────────────────────────

export function PostReader({ post, loading, actions, onClose }: { post: ReadingPost | null; loading: boolean; actions: PostActions; onClose: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [post?.id]);

  const album = post ? albumOf(post) : [];
  return (
    <Dialog open={Boolean(post) || loading} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="post-reader" showCloseButton={false}>
        <div className="reader-progress" aria-hidden="true"><i style={{ width: `${progress * 100}%` }} /></div>
        <header className="reader-bar">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Yopish"><X size={22} /></button>
          <DialogTitle className="reader-bar-title">{post ? (post.format === "article" ? "Maqola" : post.name) : "Yuklanmoqda…"}</DialogTitle>
          {post && <ShareButton post={post} compact />}
        </header>
        <DialogDescription className="sr-only">Postni to&apos;liq o&apos;qish</DialogDescription>
        <div
          className="reader-scroll"
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            setProgress(el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 1);
          }}
        >
          {!post ? <p className="feed-empty" role="status">Yuklanmoqda…</p> : (
            <article className={`reader-article${post.format === "article" ? " is-article" : ""}`}>
              {post.format === "article" && <MediaAlbum items={album} />}
              {post.kind === "announcement" && <div className="post-badge"><Megaphone size={14} />E&apos;lon</div>}
              {post.title && <h1 className="reader-title">{post.title}</h1>}
              <div className="reader-byline">
                <span className="reader-avatar">{post.avatarUrl ? <img src={absoluteUrl(post.avatarUrl)} alt="" referrerPolicy="no-referrer" /> : post.name.slice(0, 1).toUpperCase()}</span>
                <span>
                  <button type="button" className="author-link" onClick={() => { onClose(); actions.openAuthor(post.userId); }}>{post.name}</button>
                  <small>{formatDate(post.createdAt, true)}{post.format === "article" ? ` · ${post.readMinutes} daqiqa o'qish` : ""}{post.editedAt ? " · tahrirlangan" : ""}</small>
                </span>
              </div>
              {post.format !== "article" && <MediaAlbum items={album} />}
              <RichContent doc={post.content} text={post.body} media={post.media} className="reader-body" />
              {post.book && <div className="post-book"><BookOpen size={15} /><span>{post.book}</span></div>}
              <div className="post-footer reader-footer">
                <ReactionBar post={post} actions={actions} />
                <ShareButton post={post} />
              </div>
              <section className="reader-comments" aria-label="Izohlar">
                <h2>Izohlar {post.replies.length ? <span>{post.replies.length}</span> : null}</h2>
                <Replies post={post} actions={actions} />
              </section>
            </article>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

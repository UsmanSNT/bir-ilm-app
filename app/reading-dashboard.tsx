"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BookOpen, MessageCircle, Send, UserPlus, UserCheck, Flame, Clock, Users, Trash2, RefreshCw, X, NotebookPen, Pencil, Save } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { SocialData, ReadingPost } from "./social-types";

const empty: SocialData = { userId: "", posts: [], readers: [], following: [], followers: 0, focusMinutes: 0, sessions: 0, profile: null, authorProfile: null };

export default function ReadingDashboard({ name, pages, shelfCount, streak, mode }: { name: string; pages: number; shelfCount: number; streak: number; mode: "feed" | "profile" }) {
  const [data, setData] = useState<SocialData>(empty);
  const [scope, setScope] = useState(mode === "profile" ? "mine" : "all");
  const [author, setAuthor] = useState("");
  const [book, setBook] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [openReply, setOpenReply] = useState("");
  const [drafts, setDrafts] = useState<Record<string,string>>({});
  const [deleteId, setDeleteId] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [writingPost, setWritingPost] = useState(false);
  const [bio, setBio] = useState("");

  const reload = useCallback(async (signal?: AbortSignal, before?: string) => {
    const query = new URLSearchParams({ scope });
    if (author) query.set("author", author);
    if (before) query.set("before", before);
    const response = await fetch(`/api/social?${query}`, { signal });
    if (!response.ok) throw Error("Lenta yuklanmadi. Qayta urinib ko'ring.");
    const next = await response.json() as SocialData;
    setData(old => ({ ...next, posts: before ? [...old.posts, ...next.posts.filter(p => !old.posts.some(o => o.id === p.id))] : next.posts }));
    setMore(next.posts.length === 20);
    setError("");
  }, [scope, author]);

  useEffect(() => {
    const ctrl = new AbortController();
    queueMicrotask(() => {
      if (ctrl.signal.aborted) return;
      setLoading(true);
      void reload(ctrl.signal).catch(e => { if (!ctrl.signal.aborted) setError(e.message); }).finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    });
    return () => ctrl.abort();
  }, [reload]);

  useEffect(() => {
    const refreshFocus = () => { void reload().catch(() => {}); };
    window.addEventListener("bir-focus-saved", refreshFocus);
    return () => window.removeEventListener("bir-focus-saved", refreshFocus);
  }, [reload]);

  useEffect(() => {
    if (!data.userId) return;
    void fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "profile", name }) }).catch(() => {});
  }, [data.userId, name]);

  async function write(payload: Record<string, unknown>) {
    const response = await fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, name }) });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      throw Error(result.error || "Saqlanmadi.");
    }
  }

  async function action(payload: Record<string, unknown>, success: () => void = () => {}) {
    setBusy(true);
    try {
      await write(payload);
      success();
      try { await reload(); } catch { setError("Saqlandi, lekin lenta yangilanmadi. Yangilash tugmasini bosing."); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Saqlanmadi."); }
    finally { setBusy(false); }
  }

  async function publish(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await write({ type: "post", book, body });
      setBook(""); setBody(""); setWritingPost(false);
      toast.success("Postingiz joylandi.");
      if (scope === "mine" && !author) {
        try { await reload(); } catch { setError("Post saqlandi. Lentani yangilang."); }
      } else { setScope("mine"); setAuthor(""); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Post saqlanmadi."); }
    finally { setBusy(false); }
  }

  async function refresh(before?: string) {
    setLoading(true);
    try { await reload(undefined, before); }
    catch (e) { setError(e instanceof Error ? e.message : "Lenta yuklanmadi."); }
    finally { setLoading(false); }
  }

  const followButton = (id: string) => <button className="follow-button" disabled={busy || !data.userId} aria-pressed={data.following.includes(id)} onClick={() => void action({ type: "follow", target: id, follow: !data.following.includes(id) })}>
    {data.following.includes(id) ? <UserCheck size={17} /> : <UserPlus size={17} />}{data.following.includes(id) ? "Obunadasiz" : "Obuna"}
  </button>;

  const postView = (post: ReadingPost) => <article className="reading-post" key={post.id}>
    <header className="post-header">
      <span className="reader-avatar" aria-hidden="true">{post.name.slice(0,1).toUpperCase()}</span>
      <div className="post-author"><button className="author-link" onClick={() => { setAuthor(post.userId); setScope("all"); }}>{post.name}{post.userId === data.userId ? " (siz)" : ""}</button><time dateTime={post.createdAt}>{new Date(post.createdAt.replace(" ","T") + (post.createdAt.endsWith("Z") ? "" : "Z")).toLocaleDateString("uz-UZ", { day: "numeric", month: "short" })}</time></div>
      {post.userId !== data.userId ? followButton(post.userId) : <button className="icon-btn" title="Postni o'chirish" aria-label="Postni o'chirish" disabled={busy} onClick={() => setDeleteId(post.id)}><Trash2 size={17}/></button>}
    </header>
    <div className="post-book"><BookOpen size={17}/><strong>{post.book}</strong></div>
    <p className="post-body">{post.body}</p>
    {deleteId === post.id && <div className="delete-confirm"><span>Post va izohlar o&apos;chirilsinmi?</span><button className="text-btn" disabled={busy} onClick={() => void action({ type: "delete", postId: post.id }, () => setDeleteId(""))}>O&apos;chirish</button><button className="text-btn" onClick={() => setDeleteId("")}>Bekor qilish</button></div>}
    <button className="reply-toggle" aria-expanded={openReply === post.id} onClick={() => setOpenReply(openReply === post.id ? "" : post.id)}><MessageCircle size={18}/>{post.replies.length ? `${post.replies.length} ta fikr` : "Fikr bildirish"}</button>
    {openReply === post.id && <div className="post-replies">
      {post.replies.map(reply => <div className="post-reply" key={reply.id}><strong>{reply.name}</strong><p>{reply.body}</p></div>)}
      <form className="reply-form" onSubmit={e => { e.preventDefault(); void action({ type: "reply", postId: post.id, body: drafts[post.id] }, () => setDrafts(v => ({ ...v, [post.id]: "" }))); }}>
        <textarea aria-label={`${post.name} postiga izoh`} placeholder="Siz qanday fikrdasiz?" rows={2} maxLength={1000} required value={drafts[post.id] || ""} onChange={e => setDrafts(v => ({ ...v, [post.id]: e.target.value }))}/>
        <button className="icon-btn" title="Izoh yuborish" aria-label="Izoh yuborish" disabled={busy || !drafts[post.id]?.trim()}><Send size={19}/></button>
      </form>
    </div>}
  </article>;

  return <div className={`reading-dashboard dashboard-${mode}`}>
    {mode === "profile" && <section className="social-profile" aria-label="Mening profilim">
      <div className="profile-identity"><span className="reader-avatar profile-avatar">{name.slice(0,1).toUpperCase()}</span><div><span className="profile-kicker">MENING DASHBOARDIM</span><h2>{name}</h2><p>{data.profile?.bio || "O'zingiz haqingizda qisqacha yozing."}</p></div></div>
      <button className="follow-button" disabled={!data.userId} onClick={() => { setBio(data.profile?.bio || ""); setEditingProfile(true); }}><Pencil size={16}/>Profilni tahrirlash</button>
      <div className="profile-counts"><button onClick={() => { setScope("mine"); setAuthor(""); }}><strong>{data.profile?.posts ?? 0}</strong> post</button><span><strong>{data.followers}</strong> kuzatuvchi</span><button onClick={() => { setScope("following"); setAuthor(""); }}><strong>{data.following.length}</strong> obuna</button></div>
    </section>}
    <Dialog open={editingProfile} onOpenChange={setEditingProfile}><DialogContent className="profile-editor"><DialogTitle>Profilni tahrirlash</DialogTitle><DialogDescription>O&apos;zim haqimda</DialogDescription><form onSubmit={e => { e.preventDefault(); void action({ type: "profile", bio }, () => { setEditingProfile(false); toast.success("Profil saqlandi."); }); }}><label htmlFor="reader-bio">Qisqacha ma&apos;lumot</label><textarea id="reader-bio" rows={5} maxLength={300} value={bio} onChange={e => setBio(e.target.value)} placeholder="Qiziqishlaringiz, sevimli kitoblaringiz..."/><div className="compose-footer"><span>{bio.length}/300</span><button className="button" disabled={busy}><Save size={17}/>{busy ? "Saqlanmoqda..." : "Saqlash"}</button></div></form></DialogContent></Dialog>
    {mode === "profile" && <div className="dashboard-metrics" aria-label="Shaxsiy dashboard">
      <div><BookOpen size={20}/><strong>{pages}<small>sahifa</small></strong><span>{shelfCount} kitob javonda</span></div>
      <div><Clock size={20}/><strong>{data.focusMinutes}<small>daqiqa</small></strong><span>{data.sessions} mutolaa seansi</span></div>
      <div><Flame size={20}/><strong>{streak}<small>kun</small></strong><span>Ketma-ket mutolaa</span></div>
      <div><Users size={20}/><strong>{data.followers}<small>kuzatuvchi</small></strong><span>{data.following.length} obuna</span></div>
    </div>}
    <div className="social-layout">
      <div className="social-main">
        <div className="section-row"><h2>{mode === "profile" ? scope === "mine" ? "Mening postlarim" : scope === "following" ? "Obunalarim postlari" : "Barcha postlar" : "Kitobxonlar davrasi"}</h2><button className="icon-btn" aria-label="Lentani yangilash" title="Yangilash" disabled={loading || busy} onClick={() => void refresh()}><RefreshCw size={19}/></button></div>
        {mode === "profile" && <>
        <button className="button" disabled={!data.userId} onClick={() => setWritingPost(true)}><NotebookPen size={18}/>Post yozish</button>
        <Dialog open={writingPost} onOpenChange={open => { if (!busy) setWritingPost(open); }}>
        <DialogContent className="post-editor"><DialogTitle>Post yozish</DialogTitle><DialogDescription>Kitob haqidagi taassurotlaringiz</DialogDescription>
        <form className="post-compose" onSubmit={e => void publish(e)}>
          <input aria-label="Kitob nomi" placeholder="Qaysi kitobni o'qidingiz?" maxLength={160} required value={book} onChange={e => setBook(e.target.value)}/>
          <textarea aria-label="Post matni" placeholder="Taassurot, iqtibos yoki kichik xulosangiz..." maxLength={2000} rows={3} required value={body} onChange={e => setBody(e.target.value)}/>
          <div className="compose-footer"><span>{body.length}/2000</span><button className="button" disabled={busy || !data.userId || !book.trim() || !body.trim()}><Send size={17}/>{busy ? "Kutilmoqda..." : "Joylash"}</button></div>
        </form>
        </DialogContent></Dialog>
        <Tabs value={scope} onValueChange={v => { setScope(v); setAuthor(""); }}><TabsList className="feed-tabs" aria-label="Lenta filtri"><TabsTrigger value="all">Barchasi</TabsTrigger><TabsTrigger value="following">Obunalarim</TabsTrigger><TabsTrigger value="mine">Postlarim</TabsTrigger></TabsList></Tabs>
        </>}
        {author && <div className="author-filter"><span>{data.readers.find(r => r.id === author)?.name || "Kitobxon"} postlari</span><button className="icon-btn" title="Filtrni tozalash" aria-label="Filtrni tozalash" onClick={() => setAuthor("")}><X size={17}/></button></div>}
        {author && data.authorProfile && <section className="public-profile"><h3>{data.authorProfile.name}</h3><p>{data.authorProfile.bio || "Hali o'zi haqida ma'lumot kiritmagan."}</p><span>{data.authorProfile.posts} post · {data.authorProfile.followers} kuzatuvchi</span>{author !== data.userId && followButton(author)}</section>}
        {error && <div className="feed-error" role="alert">{error}<button className="text-btn" disabled={loading} onClick={() => void refresh()}>Qayta urinish</button></div>}
        {loading ? <p className="feed-empty" role="status">Lenta yuklanmoqda...</p> : data.posts.length ? data.posts.map(postView) : !error && <div className="feed-empty"><BookOpen size={28}/><h3>{mode === "feed" ? "Hozircha postlar yo'q" : scope === "following" ? "Fikirdoshlaringizni toping" : "Hozircha postlar yo'q"}</h3><p>{mode === "feed" ? "Kitobxonlarning yangi postlari shu yerda ko'rinadi." : scope === "following" ? "Obuna bo'lgan kitobxonlaringizning postlari shu yerda ko'rinadi." : "O'qigan kitobingizdan sizga eng ta'sir qilgan fikrni ulashing."}</p></div>}
        {more && !loading && <button className="text-btn load-more" onClick={() => void refresh(data.posts.at(-1)?.id)}>Yana ko&apos;rsatish</button>}
      </div>
      {mode === "profile" && <aside className="social-aside">
        <section className="readers-section"><div className="section-row tight"><h3>Fikirdoshlar</h3><Users size={19}/></div>
          {!data.readers.some(r => r.id !== data.userId) && <p className="readers-empty">Davraga qo&apos;shilgan kitobxonlar shu yerda ko&apos;rinadi.</p>}
          {data.readers.filter(r => r.id !== data.userId).map(reader => <div className="reader-row" key={reader.id}><span className="reader-avatar">{reader.name.slice(0,1).toUpperCase()}</span><div><button className="author-link" onClick={() => { setAuthor(reader.id); setScope("all"); }}>{reader.name}</button><small>{reader.posts} post · {reader.followers} kuzatuvchi</small></div>{followButton(reader.id)}</div>)}
        </section>
      </aside>}
    </div>
  </div>;
}

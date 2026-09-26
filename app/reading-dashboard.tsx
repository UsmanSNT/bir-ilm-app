"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, UserPlus, UserCheck, Flame, Clock, Users, RefreshCw, X, NotebookPen, Pencil, Save, ShieldCheck, Newspaper, ImagePlus } from "lucide-react";
import { canModerate } from "@/shared/contract/roles";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useViewer } from "@/lib/api/roles-client";
import type { SocialData, ReadingPost } from "./social-types";
import LoginCard from "./login-card";
import { Composer } from "./community/composer";
import { PostCard, PostReader, type PostActions } from "./community/post-card";
import { LoginRequiredError, apiCall } from "./community/upload";

const empty: SocialData = { userId: "", role: "user", signedIn: false, reportedPosts: 0, posts: [], readers: [], following: [], followers: 0, focusMinutes: 0, sessions: 0, profile: null, authorProfile: null };

export default function ReadingDashboard({ name, pages, shelfCount, streak, mode }: { name: string; pages: number; shelfCount: number; streak: number; mode: "feed" | "profile" }) {
  const viewer = useViewer();
  const [data, setData] = useState<SocialData>(empty);
  const [scope, setScope] = useState(mode === "profile" ? "mine" : "all");
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<ReadingPost | null>(null);
  const [bio, setBio] = useState("");
  const [loginReason, setLoginReason] = useState("");
  const [reader, setReader] = useState<ReadingPost | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const moderator = canModerate(data.role);

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

  const requireLogin = useCallback((reason: string) => setLoginReason(reason), []);

  async function write(payload: Record<string, unknown>) {
    const response = await fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, name }) });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (response.status === 401) throw new LoginRequiredError(result.error || "Avval tizimga kiring.");
      throw Error(result.error || "Saqlanmadi.");
    }
  }

  const fetchPost = useCallback(async (id: string): Promise<ReadingPost | null> => {
    const response = await fetch(`/api/social?post=${encodeURIComponent(id)}`);
    if (!response.ok) return null;
    return ((await response.json()) as SocialData).posts[0] ?? null;
  }, []);

  const openPost = useCallback(async (post: ReadingPost | string) => {
    const id = typeof post === "string" ? post : post.id;
    if (typeof post !== "string") setReader(post.truncated ? null : post);
    setReaderLoading(true);
    const full = await fetchPost(id).catch(() => null);
    setReaderLoading(false);
    if (full) setReader(full);
    else if (typeof post === "string" || post.truncated) { setReader(null); toast.error("Post topilmadi yoki o'chirilgan."); }
  }, [fetchPost]);

  // Ulashilgan havola: /?post=<id> — postni darhol ochamiz.
  useEffect(() => {
    if (mode !== "feed") return;
    const query = new URLSearchParams(window.location.search);
    const id = query.get("post");
    if (!id) return;
    query.delete("post");
    window.history.replaceState(null, "", `${window.location.pathname}${query.size ? `?${query}` : ""}`);
    queueMicrotask(() => void openPost(id));
  }, [mode, openPost]);

  /** Lentadagi va ochiq o'qish oynasidagi postni birga yangilaydi. */
  const patchPost = useCallback((id: string, change: (post: ReadingPost) => ReadingPost) => {
    setData(old => ({ ...old, posts: old.posts.map(p => (p.id === id ? change(p) : p)) }));
    setReader(old => (old?.id === id ? change(old) : old));
  }, []);

  async function action(payload: Record<string, unknown>, success: () => void = () => {}) {
    setBusy(true);
    try {
      await write(payload);
      success();
      try { await reload(); } catch { setError("Saqlandi, lekin lenta yangilanmadi. Yangilash tugmasini bosing."); }
      return true;
    } catch (e) {
      if (e instanceof LoginRequiredError) requireLogin(e.message);
      else toast.error(e instanceof Error ? e.message : "Saqlanmadi.");
      return false;
    }
    finally { setBusy(false); }
  }

  async function refresh(before?: string) {
    setLoading(true);
    try { await reload(undefined, before); }
    catch (e) { setError(e instanceof Error ? e.message : "Lenta yuklanmadi."); }
    finally { setLoading(false); }
  }

  const refreshReader = async (id: string) => {
    if (reader?.id !== id) return;
    const full = await fetchPost(id).catch(() => null);
    if (full) setReader(full);
  };

  const actions: PostActions = {
    viewerId: data.userId,
    signedIn: data.signedIn,
    moderator,
    following: data.following,
    busy,
    requireLogin,
    openPost: post => void openPost(post),
    openAuthor: userId => { setReader(null); setAuthor(userId); setScope("all"); },
    follow: (target, follow) => void action({ type: "follow", target, follow }),
    react: (post, emoji) => {
      // Darhol ko'rsatamiz, server javobi bilan aniqlashtiramiz.
      const previous = { reactions: post.reactions, myReaction: post.myReaction };
      patchPost(post.id, p => {
        const counts = new Map(p.reactions.map(r => [r.emoji, r.count]));
        if (p.myReaction) counts.set(p.myReaction, (counts.get(p.myReaction) ?? 1) - 1);
        if (emoji) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
        return { ...p, myReaction: emoji, reactions: [...counts].filter(([, n]) => n > 0).map(([e, count]) => ({ emoji: e, count })).sort((a, b) => b.count - a.count) };
      });
      apiCall<{ reactions: ReadingPost["reactions"]; mine: string | null }>("/community/reactions", { method: "POST", body: JSON.stringify({ postId: post.id, emoji }) })
        .then(result => patchPost(post.id, p => ({ ...p, reactions: result.reactions, myReaction: result.mine })))
        .catch((e: unknown) => {
          patchPost(post.id, p => ({ ...p, ...previous }));
          if (e instanceof LoginRequiredError) requireLogin(e.message);
          else toast.error(e instanceof Error ? e.message : "Reaksiya saqlanmadi.");
        });
    },
    reply: async (postId, body) => {
      const ok = await action({ type: "reply", postId, body });
      if (ok) await refreshReader(postId);
      return ok;
    },
    deleteReply: replyId => void action({ type: "deleteReply", replyId }, () => { if (reader) void refreshReader(reader.id); }),
    edit: post => {
      void (async () => {
        const full = post.truncated ? await fetchPost(post.id).catch(() => null) : post;
        if (!full) { toast.error("Postni ochib bo'lmadi."); return; }
        setReader(null);
        setEditing(full);
        setComposing(true);
      })();
    },
    remove: post => void action({ type: "delete", postId: post.id }, () => { setReader(old => (old?.id === post.id ? null : old)); toast.success("Post o'chirildi."); }),
    report: (post, reason) => void action({ type: "report", postId: post.id, reason }, () => toast.success("Shikoyatingiz moderatorlarga yuborildi.")),
    dismissReports: post => void action({ type: "dismissReports", postId: post.id }, () => toast.success("Shikoyat yopildi — post qoldi.")),
  };

  const startWriting = () => {
    if (!data.signedIn) { requireLogin("Post yozish uchun Google yoki Telegram orqali kiring."); return; }
    setEditing(null);
    setComposing(true);
  };

  const onPublished = async (id: string, edited: boolean) => {
    toast.success(edited ? "O'zgarishlar saqlandi." : "Joylandi!");
    if (mode === "feed" || (scope === "mine" && !author)) {
      try { await reload(); } catch { setError("Post saqlandi. Lentani yangilang."); }
    } else { setScope("mine"); setAuthor(""); }
    if (edited && reader?.id === id) void refreshReader(id);
  };

  const followButton = (id: string) => <button className="follow-button" disabled={busy || !data.userId} aria-pressed={data.following.includes(id)} onClick={() => void action({ type: "follow", target: id, follow: !data.following.includes(id) })}>
    {data.following.includes(id) ? <UserCheck size={17} /> : <UserPlus size={17} />}{data.following.includes(id) ? "Obunadasiz" : "Obuna"}
  </button>;

  const authorName = useMemo(() => data.authorProfile?.name || data.readers.find(r => r.id === author)?.name || "Kitobxon", [data.authorProfile, data.readers, author]);

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
        <button type="button" className="compose-launch" disabled={!data.userId} onClick={startWriting}>
          <span className="reader-avatar" aria-hidden="true">{name.slice(0,1).toUpperCase()}</span>
          <span className="compose-launch-text">{data.signedIn ? "Nima o'qidingiz? Fikr, maqola yoki rasm ulashing…" : "Post yozish uchun tizimga kiring"}</span>
          <span className="compose-launch-icons" aria-hidden="true"><ImagePlus size={19}/><Newspaper size={19}/><NotebookPen size={19}/></span>
        </button>
        <Composer open={composing} onOpenChange={open => { setComposing(open); if (!open) setEditing(null); }} editing={editing} moderator={moderator} onPublished={(id, edited) => void onPublished(id, edited)} onLoginRequired={() => requireLogin("Davom etish uchun tizimga kiring.")} />
        <Tabs value={scope} onValueChange={v => { setScope(v); setAuthor(""); }}><TabsList className="feed-tabs" aria-label="Lenta filtri"><TabsTrigger value="all">Barchasi</TabsTrigger><TabsTrigger value="following">Obunalarim</TabsTrigger>{mode === "profile" ? <TabsTrigger value="mine">Postlarim</TabsTrigger> : <TabsTrigger value="announcements">E&apos;lonlar</TabsTrigger>}{moderator && mode === "feed" && <TabsTrigger value="reported"><ShieldCheck size={14}/>Shikoyatlar{data.reportedPosts ? ` (${data.reportedPosts})` : ""}</TabsTrigger>}</TabsList></Tabs>
        {author && <div className="author-filter"><span>{authorName} postlari</span><button className="icon-btn" title="Filtrni tozalash" aria-label="Filtrni tozalash" onClick={() => setAuthor("")}><X size={17}/></button></div>}
        {author && data.authorProfile && <section className="public-profile"><h3>{data.authorProfile.name}</h3><p>{data.authorProfile.bio || "Hali o'zi haqida ma'lumot kiritmagan."}</p><span>{data.authorProfile.posts} post · {data.authorProfile.followers} kuzatuvchi</span>{author !== data.userId && followButton(author)}</section>}
        {error && <div className="feed-error" role="alert">{error}<button className="text-btn" disabled={loading} onClick={() => void refresh()}>Qayta urinish</button></div>}
        {loading && !data.posts.length ? <p className="feed-empty" role="status">Lenta yuklanmoqda...</p> : data.posts.length ? data.posts.map(post => <PostCard key={post.id} post={post} actions={actions} />) : !error && <div className="feed-empty"><BookOpen size={28}/><h3>{scope === "reported" ? "Ko'rib chiqiladigan shikoyat yo'q" : scope === "announcements" ? "Hozircha e'lonlar yo'q" : mode === "feed" ? "Hozircha postlar yo'q" : scope === "following" ? "Fikirdoshlaringizni toping" : "Hozircha postlar yo'q"}</h3><p>{mode === "feed" ? "Kitobxonlarning yangi postlari shu yerda ko'rinadi." : scope === "following" ? "Obuna bo'lgan kitobxonlaringizning postlari shu yerda ko'rinadi." : "O'qigan kitobingizdan sizga eng ta'sir qilgan fikrni ulashing."}</p></div>}
        {more && !loading && <button className="text-btn load-more" onClick={() => void refresh(data.posts.at(-1)?.id)}>Yana ko&apos;rsatish</button>}
      </div>
      {mode === "profile" && <aside className="social-aside">
        <section className="readers-section"><div className="section-row tight"><h3>Fikirdoshlar</h3><Users size={19}/></div>
          {!data.readers.some(r => r.id !== data.userId) && <p className="readers-empty">Davraga qo&apos;shilgan kitobxonlar shu yerda ko&apos;rinadi.</p>}
          {data.readers.filter(r => r.id !== data.userId).map(reader => <div className="reader-row" key={reader.id}><span className="reader-avatar">{reader.name.slice(0,1).toUpperCase()}</span><div><button className="author-link" onClick={() => { setAuthor(reader.id); setScope("all"); }}>{reader.name}</button><small>{reader.posts} post · {reader.followers} kuzatuvchi</small></div>{followButton(reader.id)}</div>)}
        </section>
      </aside>}
    </div>
    <PostReader post={reader} loading={readerLoading} actions={actions} onClose={() => { setReader(null); setReaderLoading(false); }} />
    <Dialog open={Boolean(loginReason)} onOpenChange={open => { if (!open) setLoginReason(""); }}>
      <DialogContent className="login-dialog">
        <DialogTitle className="sr-only">Tizimga kirish</DialogTitle>
        <DialogDescription className="sr-only">{loginReason}</DialogDescription>
        {viewer ? <LoginCard viewer={viewer} title="Hamjamiyatga qo'shiling" text={`${loginReason} Community'da faqat ro'yxatdan o'tgan kitobxonlar yozadi — o'qish hammaga ochiq.`} /> : <p role="status">Yuklanmoqda…</p>}
      </DialogContent>
    </Dialog>
  </div>;
}

"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BookOpen, UserPlus, UserCheck, Users, RefreshCw, X, NotebookPen, Pencil, Save, Clock, type LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { postKinds, type PostKind, type SocialData, type ReadingPost, type Reader } from "./social-types";
import PostCard, { kindLabels } from "./post-card";
import PostComposer from "./post-composer";
import { AUTH_CHANGED, signalAuthRequired, useAuth } from "./auth";

const empty: SocialData = { userId: "", followersList: [], followingList: [], posts: [], readers: [], following: [], followers: 0, focusMinutes: 0, sessions: 0, profile: null, authorProfile: null };

export type Highlight = { icon: LucideIcon; value: string | number; label: string; tone?: "anor" | "tilla" | "firuza" | "lojuvard" };
export type ProfileTab = { id: string; label: string; content: ReactNode };
type BuiltinTab = "posts" | "readers" | "followers" | "following";

export default function ReadingDashboard({ name, mode, highlights = [], tabs = [] }: {
  name: string; mode: "feed" | "profile" | "gurung"; highlights?: Highlight[]; tabs?: ProfileTab[];
}) {
  const { user, requireAuth } = useAuth();
  const [data, setData] = useState<SocialData>(empty);
  const [scope, setScope] = useState(mode === "profile" ? "mine" : "all");
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [openReply, setOpenReply] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingProfile, setEditingProfile] = useState(false);
  const [writingPost, setWritingPost] = useState(false);
  const [bio, setBio] = useState("");
  const [kindFilter, setKindFilter] = useState<PostKind | "">("");
  const [tab, setTab] = useState<string>("posts");
  const profile = mode === "profile";

  const reload = useCallback(async (signal?: AbortSignal, before?: string) => {
    const query = new URLSearchParams({ scope });
    if (author) query.set("author", author);
    if (kindFilter) query.set("kind", kindFilter);
    if (before) query.set("before", before);
    const response = await fetch(`/api/social?${query}`, { signal });
    if (!response.ok) throw Error("Lenta yuklanmadi. Qayta urinib ko'ring.");
    const next = await response.json() as SocialData;
    setData(old => ({ ...next, posts: before ? [...old.posts, ...next.posts.filter(p => !old.posts.some(o => o.id === p.id))] : next.posts }));
    setMore(next.posts.length === 20);
    setError("");
  }, [scope, author, kindFilter]);

  useEffect(() => {
    const ctrl = new AbortController();
    queueMicrotask(() => {
      if (ctrl.signal.aborted) return;
      setLoading(true);
      void reload(ctrl.signal).catch(e => { if (!ctrl.signal.aborted) setError(e.message); }).finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    });
    return () => ctrl.abort();
  }, [reload]);

  // Pomodoro seansi saqlanganda yoki hisobga kirish/chiqishda ma'lumot yangilanadi.
  useEffect(() => {
    const refresh = () => { void reload().catch(() => {}); };
    window.addEventListener("bir-focus-saved", refresh);
    window.addEventListener(AUTH_CHANGED, refresh);
    return () => { window.removeEventListener("bir-focus-saved", refresh); window.removeEventListener(AUTH_CHANGED, refresh); };
  }, [reload]);

  async function write(payload: Record<string, unknown>) {
    const response = await fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (response.status === 401) { signalAuthRequired(); throw Error("Avval hisobingizga kiring."); }
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      throw Error(result.error || "Saqlanmadi.");
    }
  }

  async function action(payload: Record<string, unknown>, success: () => void = () => {}) {
    if (!user) { requireAuth(() => void action(payload, success)); return; }
    setBusy(true);
    try {
      await write(payload);
      success();
      try { await reload(); } catch { setError("Saqlandi, lekin lenta yangilanmadi. Yangilash tugmasini bosing."); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Saqlanmadi."); }
    finally { setBusy(false); }
  }

  // Composer o'zi yuklash/xatoni boshqaradi; bu yerda faqat yozish va lentani yangilash.
  async function publish(payload: Record<string, unknown>) {
    await write(payload);
    toast.success("Postingiz joylandi.");
    if (mode === "gurung" || (scope === "mine" && !author)) {
      try { await reload(); } catch { setError("Post saqlandi. Lentani yangilang."); }
    } else { setScope("mine"); setAuthor(""); }
  }

  async function refresh(before?: string) {
    setLoading(true);
    try { await reload(undefined, before); }
    catch (e) { setError(e instanceof Error ? e.message : "Lenta yuklanmadi."); }
    finally { setLoading(false); }
  }

  const compose = () => requireAuth(() => setWritingPost(true));
  const followButton = (id: string) => <button className="follow-button" disabled={busy} aria-pressed={data.following.includes(id)} onClick={() => void action({ type: "follow", target: id, follow: !data.following.includes(id) })}>
    {data.following.includes(id) ? <UserCheck size={17} /> : <UserPlus size={17} />}{data.following.includes(id) ? "Obunadasiz" : "Obuna"}
  </button>;

  const postView = (post: ReadingPost) => <PostCard key={post.id} post={post} meId={data.userId} following={data.following.includes(post.userId)} busy={busy}
    replyOpen={openReply === post.id} draft={drafts[post.id] || ""}
    onAuthor={() => { if (!profile) { setAuthor(post.userId); setScope("all"); } }}
    onToggleReplies={() => setOpenReply(openReply === post.id ? "" : post.id)}
    onDraft={value => setDrafts(v => ({ ...v, [post.id]: value }))}
    onAction={(payload, done) => void action(payload, done)} />;

  const readerList = (list: Reader[], emptyText: string) => list.length
    ? <div className="pf-list">{list.map(reader => <div className="reader-row" key={reader.id}>
        <span className="reader-avatar">{reader.name.slice(0, 1).toUpperCase()}</span>
        <div><strong>{reader.name}</strong><small>{reader.posts} post · {reader.followers} kuzatuvchi</small></div>
        {reader.id !== data.userId && followButton(reader.id)}
      </div>)}</div>
    : <div className="feed-empty"><Users size={28} /><p>{emptyText}</p></div>;

  const kindChips = <div className="genre-chips kind-filter" aria-label="Post turi bo'yicha"><button aria-pressed={kindFilter === ""} onClick={() => setKindFilter("")}>Hammasi</button>{postKinds.map(k => <button key={k} aria-pressed={kindFilter === k} onClick={() => setKindFilter(kindFilter === k ? "" : k)}>{kindLabels[k]}</button>)}</div>;

  const feed = <>
    {error && <div className="feed-error" role="alert">{error}<button className="text-btn" disabled={loading} onClick={() => void refresh()}>Qayta urinish</button></div>}
    {loading ? <p className="feed-empty" role="status">Lenta yuklanmoqda...</p> : data.posts.length ? data.posts.map(postView) : !error && <div className="feed-empty"><BookOpen size={28} /><h3>Hozircha postlar yo&apos;q</h3><p>{profile ? "O'qigan kitobingizdan sizga eng ta'sir qilgan fikrni ulashing." : scope === "following" ? "Obuna bo'lgan kitobxonlaringizning postlari shu yerda ko'rinadi." : "Kitobxonlarning yangi postlari shu yerda ko'rinadi."}</p></div>}
    {more && !loading && <button className="text-btn load-more" onClick={() => void refresh(data.posts.at(-1)?.id)}>Yana ko&apos;rsatish</button>}
  </>;

  const composer = <Dialog open={writingPost} onOpenChange={setWritingPost}>
    <DialogContent className="post-editor ig-composer"><DialogTitle>Yangi post</DialogTitle><DialogDescription>Karta yasang yoki rasm/video ulashing</DialogDescription>
      {writingPost && <PostComposer submit={publish} onDone={() => setWritingPost(false)} />}
    </DialogContent>
  </Dialog>;

  if (profile) {
    const others = data.readers.filter(r => r.id !== data.userId);
    const builtins: { id: BuiltinTab; label: string; count?: number }[] = [
      { id: "posts", label: "Postlar", count: data.profile?.posts ?? 0 },
      { id: "readers", label: "Fikrdoshlar", count: others.length },
      { id: "followers", label: "Kuzatuvchilar", count: data.followers },
      { id: "following", label: "Obunalar", count: data.following.length },
    ];
    const allTabs = [...builtins, ...tabs.map(t => ({ id: t.id, label: t.label, count: undefined }))];
    return <div className="reading-dashboard dashboard-profile">
      <section className="pf-head" aria-label="Mening profilim">
        <span className="pf-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
        <div className="pf-who">
          <h2>{name}</h2>
          {user && <span className="pf-login">@{user.login}</span>}
          <p>{data.profile?.bio || "O'zingiz haqingizda qisqacha yozing."}</p>
        </div>
        <button className="pf-edit" onClick={() => { setBio(data.profile?.bio || ""); setEditingProfile(true); }}><Pencil size={15} />Tahrirlash</button>
        <div className="pf-counts">
          <button onClick={() => setTab("posts")}><strong>{data.profile?.posts ?? 0}</strong>post</button>
          <button onClick={() => setTab("followers")}><strong>{data.followers}</strong>kuzatuvchi</button>
          <button onClick={() => setTab("following")}><strong>{data.following.length}</strong>obuna</button>
        </div>
      </section>

      <div className="pf-highlights" aria-label="Ko'rsatkichlar">
        {[...highlights, { icon: Clock, value: data.focusMinutes, label: "daqiqa mutolaa", tone: "lojuvard" as const }].map(h => <div key={h.label} className={`pf-hl tone-${h.tone ?? "firuza"}`}>
          <h.icon size={18} /><strong>{h.value}</strong><span>{h.label}</span>
        </div>)}
      </div>

      <div className="pf-tabs" role="tablist" aria-label="Profil bo'limlari">
        {allTabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}{t.count !== undefined && <span>{t.count}</span>}</button>)}
      </div>

      <div className="pf-panel" role="tabpanel">
        {tab === "posts" && <>
          <div className="pf-panel-head"><button className="button" onClick={compose}><NotebookPen size={18} />Post yozish</button><button className="icon-btn" aria-label="Yangilash" disabled={loading || busy} onClick={() => void refresh()}><RefreshCw size={18} /></button></div>
          {kindChips}
          <div className="pf-feed">{feed}</div>
        </>}
        {tab === "readers" && readerList(others, "Davraga qo'shilgan kitobxonlar shu yerda ko'rinadi.")}
        {tab === "followers" && readerList(data.followersList, "Hali kuzatuvchilaringiz yo'q.")}
        {tab === "following" && readerList(data.followingList, "Hali hech kimga obuna bo'lmagansiz.")}
        {tabs.find(t => t.id === tab)?.content}
      </div>

      {composer}
      <Dialog open={editingProfile} onOpenChange={setEditingProfile}><DialogContent className="profile-editor"><DialogTitle>Profilni tahrirlash</DialogTitle><DialogDescription>O&apos;zim haqimda</DialogDescription><form onSubmit={e => { e.preventDefault(); void action({ type: "profile", bio }, () => { setEditingProfile(false); toast.success("Profil saqlandi."); }); }}><label htmlFor="reader-bio">Qisqacha ma&apos;lumot</label><textarea id="reader-bio" rows={5} maxLength={300} value={bio} onChange={e => setBio(e.target.value)} placeholder="Qiziqishlaringiz, sevimli kitoblaringiz..." /><div className="compose-footer"><span>{bio.length}/300</span><button className="button" disabled={busy}><Save size={17} />{busy ? "Saqlanmoqda..." : "Saqlash"}</button></div></form></DialogContent></Dialog>
    </div>;
  }

  return <div className={`reading-dashboard dashboard-${mode}`}>
    <div className="social-layout">
      <div className="social-main">
        <div className="ig-stories" aria-label="Kitobxonlar">
          {data.readers.map(reader => <button key={reader.id} className={`ig-story ${author === reader.id ? "is-active" : ""}`} onClick={() => { setAuthor(author === reader.id ? "" : reader.id); setScope("all"); }}>
            <span className="reader-avatar">{reader.name.slice(0, 1).toUpperCase()}</span><small>{reader.id === data.userId ? "Siz" : reader.name}</small></button>)}
          {!data.readers.length && <p className="readers-empty">Gurungga qo&apos;shilgan kitobxonlar shu yerda ko&apos;rinadi.</p>}
        </div>
        <div className="section-row"><h2>{mode === "gurung" ? "Lenta" : "Kitobxonlar davrasi"}</h2><button className="icon-btn" aria-label="Lentani yangilash" title="Yangilash" disabled={loading || busy} onClick={() => void refresh()}><RefreshCw size={19} /></button></div>
        {mode === "gurung" && <>
          <button className="ig-compose" onClick={compose}><span className="reader-avatar">{name.slice(0, 1).toUpperCase()}</span><span>Kitobdan nima ulashmoqchisiz?</span><NotebookPen size={18} /></button>
          {composer}
          <Tabs value={scope} onValueChange={v => { if (v !== "all" && !user) { requireAuth(() => setScope(v)); return; } setScope(v); setAuthor(""); }}><TabsList className="feed-tabs" aria-label="Lenta filtri"><TabsTrigger value="all">Barchasi</TabsTrigger><TabsTrigger value="following">Obunalarim</TabsTrigger><TabsTrigger value="mine">Postlarim</TabsTrigger></TabsList></Tabs>
          {kindChips}
        </>}
        {author && <div className="author-filter"><span>{data.readers.find(r => r.id === author)?.name || "Kitobxon"} postlari</span><button className="icon-btn" title="Filtrni tozalash" aria-label="Filtrni tozalash" onClick={() => setAuthor("")}><X size={17} /></button></div>}
        {author && data.authorProfile && <section className="public-profile"><h3>{data.authorProfile.name}</h3><p>{data.authorProfile.bio || "Hali o'zi haqida ma'lumot kiritmagan."}</p><span>{data.authorProfile.posts} post · {data.authorProfile.followers} kuzatuvchi</span>{author !== data.userId && followButton(author)}</section>}
        {feed}
      </div>
      {mode === "gurung" && <aside className="social-aside">
        <section className="readers-section"><div className="section-row tight"><h3>Fikrdoshlar</h3><Users size={19} /></div>
          {!data.readers.some(r => r.id !== data.userId) && <p className="readers-empty">Davraga qo&apos;shilgan kitobxonlar shu yerda ko&apos;rinadi.</p>}
          {data.readers.filter(r => r.id !== data.userId).slice(0, 8).map(reader => <div className="reader-row" key={reader.id}><span className="reader-avatar">{reader.name.slice(0, 1).toUpperCase()}</span><div><button className="author-link" onClick={() => { setAuthor(reader.id); setScope("all"); }}>{reader.name}</button><small>{reader.posts} post · {reader.followers} kuzatuvchi</small></div>{followButton(reader.id)}</div>)}
        </section>
      </aside>}
    </div>
  </div>;
}

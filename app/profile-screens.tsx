"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Activity, ArrowRight, Bell, BookOpen, Bookmark, CalendarDays, Camera, ChartNoAxesColumnIncreasing, ChevronLeft, ChevronRight, CircleHelp, Crown, Download, ListChecks, Globe, Heart, Info, KeyRound, Languages, LogOut, Mail, MessageCircle, ShieldCheck, ShoppingBag, Smartphone, Lock, UserRound, Users } from "lucide-react";
import { useViewer } from "@/lib/api/roles-client";
import { refreshAdminAttention } from "@/lib/api/admin-attention";
import { useCatalog } from "@/lib/api/books-client";
import type { Book, ReceivedReaction } from "@/shared/contract";
import { fetchReceivedReactions } from "@/lib/api/notifications-client";
import { canModerate } from "@/shared/contract/roles";
import AdminPanel from "./admin-panel";
import DeviceSettings from "./device-settings";
import AdminSite from "./admin-site";
import AdminQuizzes from "./admin-quizzes";
import AdminTeam from "./admin-team";
import AdminAbout from "./admin-about";
import SocialLinks from "./social-links";
import { ChangePasswordForm } from "./password-auth";
import { LoginDialog } from "./login-dialog";
import { signOutViewer } from "@/lib/api/session";
import AccountEditor from "./account-editor";
import TwoFactorSettings from "./two-factor-settings";
import { absoluteUrl } from "@/lib/api/config";
import ReadingDashboard from "./reading-dashboard";
import { formatDate } from "./community/post-card";
import type { SocialData } from "./social-types";
import ProfileHero from "./profile-hero";
import ProfileMenu, { type MenuGroup, type MenuItem } from "./profile-menu";
import { requestInstall, useInstallAvailable } from "./pwa-install";
import { LinkDeviceDialog } from "./device-link";
import ScrollIcon from "./scroll-icon";


/** Bir Ilm shaxsiy sahifasi: o‘qish, postlar, faollik va Bir Ilm sozlamalari (do‘kon ma’lumotlari bu yerda emas). */
export type ProfileScreensProps = { name: string; page: number; total: number; shelfCount: number; streak: number; rank: number; points: number; onNavigate: (tab: string) => void; onRename: (name: string) => void; onNotifications: () => void; onOpenPost: (postId: string, replyId?: string | null) => void };
type ProfileTab = "reading" | "posts" | "activity";
const PROFILE_TABS: [ProfileTab, string][] = [["posts", "Postlar"], ["reading", "Mutolaa"], ["activity", "Faollik"]];
type Screen = "profile" | "activity" | "settings" | "posts" | "privacy" | "faq" | "admin" | "site" | "team" | "aboutAdmin" | "quizzes" | "devices" | "password" | "account" | "twofactor";

function Cover({ small = false, book }: { small?: boolean; book: Book | null }) {
  if (book?.coverUrl) return <span className={`p-book p-book-image ${small ? "p-book-small" : ""}`} aria-hidden="true"><img src={book.coverUrl} alt="" /></span>;
  return <span className={`p-book ${small ? "p-book-small" : ""}`} style={book ? { background: book.color, color: "#fff" } : undefined} aria-hidden="true"><small>BIR ILM</small><strong>{book?.title ?? "Tez orada"}</strong><span>{book ? "Hafta kitobi" : ""}</span><b>{book?.author ?? ""}</b></span>;
}

function Row({ icon, title, value, onClick }: { icon: ReactNode; title: string; value?: ReactNode; onClick: () => void }) {
  return <button type="button" className="p-row" onClick={onClick}><span className="p-row-icon">{icon}</span><span>{title}</span>{value != null && <small>{value}</small>}<ChevronRight size={17} /></button>;
}

export default function ProfileScreens(p: ProfileScreensProps) {
  const [screen, setScreen] = useState<Screen>("profile");
  // Ichki ekrandan «Orqaga» — qayerdan ochilgan bo'lsa, o'sha yerga.
  const [backTo, setBackTo] = useState<Screen>("profile");
  const [linkOpen, setLinkOpen] = useState(false);
  // Mehmon uchun kirish oynasi (modal): asosiy sahifaga aralashmaydi.
  const [authOpen, setAuthOpen] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("posts");
  const [activity, setActivity] = useState("Javoblar");
  const [social, setSocial] = useState<SocialData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  // Faollik → Reaksiyalar: tab ochilganda yuklanadi (null — hali yuklanmagan).
  const [reactions, setReactions] = useState<ReceivedReaction[] | null>(null);
  const [reactionsFailed, setReactionsFailed] = useState(false);
  const [reactionsRetry, setReactionsRetry] = useState(0);
  const viewer = useViewer();
  const installable = useInstallAvailable();
  const featured = useCatalog().active;
  const role = viewer?.role ?? "user";
  const signOut = () => void signOutViewer();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/social?scope=mine", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error();
      const data = await response.json() as SocialData;
      if (!controller.signal.aborted) { setSocial(data); setStatus("ready"); }
    }).catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [retry, screen]);
  const open = (next: Screen) => {
    if (role === "admin") refreshAdminAttention();
    // Faollik, postlar va sozlamalar — profil ichidagi tablar.
    if (next === "activity" || next === "posts") { setTab(next); next = "profile"; }
    setBackTo(next === "settings" || screen === "profile" ? "profile" : screen === next ? backTo : screen);
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  useEffect(() => {
    if (tab !== "activity" || activity !== "Reaksiyalar") return;
    let cancelled = false;
    fetchReceivedReactions()
      .then(items => { if (!cancelled) { setReactions(items); setReactionsFailed(false); } })
      .catch(() => { if (!cancelled) setReactionsFailed(true); });
    return () => { cancelled = true; };
  }, [tab, activity, reactionsRetry]);
  // Postlaringizga boshqalar yozgan izohlar (ism emas, foydalanuvchi ID si bo'yicha — bir xil ismlilar ham to'g'ri ajraladi).
  const replies = (social?.posts ?? []).flatMap(post => post.replies.filter(reply => reply.userId !== social?.userId).map(reply => ({ ...reply, book: post.book }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const titles: Record<Screen, string> = { profile: "Shaxsiy sahifa", activity: "Faollik", settings: "Menyu", posts: "Mening postlarim", privacy: "Maxfiylik va xavfsizlik", account: "Shaxsiy ma’lumotlar", twofactor: "Ikki bosqichli himoya", faq: "Ko‘p so‘raladigan savollar", admin: "Boshqaruv paneli", quizzes: "Viktorinalar", site: "Ijtimoiy tarmoqlar", team: "Jamoa", aboutAdmin: "Biz haqimizda tahriri", devices: "Kamera va mikrofon", password: "Parol" };
  const count = (value: number | undefined) => status === "ready" ? value ?? 0 : "—";

  const empty = (icon: ReactNode, title: string, text: string) => <div className="p-empty">{icon}<h2>{title}</h2><p>{text}</p><button className="p-primary" onClick={() => p.onNavigate("community")}>Hamjamiyatga o‘tish <ArrowRight size={16} /></button></div>;
  const failed = (onRetry: () => void) => <div className="p-empty"><Bell /><h2>Faollikni yuklab bo‘lmadi</h2><button className="p-link" onClick={onRetry}>Qayta urinish <ArrowRight size={15} /></button></div>;
  const avatar = (name: string, url: string | null | undefined) => <span className="p-small-avatar">{url ? <img src={absoluteUrl(url)} alt="" referrerPolicy="no-referrer" /> : name.slice(0, 1).toUpperCase() || "K"}</span>;
  const activityBody = () => {
    if (activity === "Reaksiyalar") {
      if (reactionsFailed) return failed(() => { setReactionsFailed(false); setReactions(null); setReactionsRetry(v => v + 1); });
      if (!reactions) return <div className="p-empty"><Heart /><h2>Reaksiyalar yuklanmoqda…</h2></div>;
      if (!reactions.length) return empty(<Heart />, "Hali reaksiyalar yo‘q", "Postlaringizga bildirilgan reaksiyalar shu yerda ko‘rinadi.");
      return <div className="p-activity-list"><p className="p-list-label">Postlaringizga bildirilgan reaksiyalar</p>{reactions.map(item => <button className="p-activity-row" key={`${item.postId}-${item.actor.id}`} onClick={() => p.onOpenPost(item.postId)}>{avatar(item.actor.name, item.actor.avatarUrl)}<span><strong>{item.actor.name}</strong> postingizga <span className="p-reaction-emoji">{item.emoji}</span> reaksiya bildirdi<time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time><p>{item.postExcerpt}</p></span><ChevronRight size={16} /></button>)}</div>;
    }
    if (status !== "ready") return status === "error" ? failed(() => { setStatus("loading"); setRetry(v => v + 1); }) : <div className="p-empty"><Bell /><h2>Faollik yuklanmoqda…</h2></div>;
    if (activity === "Javoblar") {
      if (!replies.length) return empty(<MessageCircle />, "Suhbat shu yerdan boshlanadi", "Postlaringizga kelgan javoblar shu yerda paydo bo‘ladi. Birinchi fikringizni ulashing.");
      return <div className="p-activity-list"><p className="p-list-label">So‘nggi javoblar</p>{replies.map(reply => <button className="p-activity-row" key={reply.id} onClick={() => p.onOpenPost(reply.postId, reply.id)}>{avatar(reply.name, null)}<span><strong>{reply.name}</strong> {reply.parentId ? "izohga javob yozdi" : "postingizga javob berdi"}<time dateTime={reply.createdAt}>{formatDate(reply.createdAt)}</time><p>“{reply.body}”</p>{reply.book && <small><BookOpen size={13} />{reply.book}</small>}</span><ChevronRight size={16} /></button>)}</div>;
    }
    if (!social?.following.length) return empty(<Users />, "Yangi tanishuvlar oldinda", "Siz kuzatgan kitobxonlar shu yerda jamlanadi.");
    return <div className="p-activity-list"><p className="p-list-label">Siz kuzatayotgan kitobxonlar</p>{social.following.map(id => { const reader = social.readers.find(item => item.id === id); return <div className="p-activity-row" key={id}>{avatar(reader?.name || "Kitobxon", null)}<span><strong>{reader?.name || "Kitobxon"}</strong><p>{reader?.bio || "Bir Ilm hamjamiyati a’zosi"}</p></span><Users size={18} /></div>; })}</div>;
  };
  const activityView = <>
      <div className="p-tabs" role="tablist" aria-label="Faollik turi">{["Javoblar", "Reaksiyalar", "Obunalar"].map(label => <button key={label} role="tab" aria-selected={activity === label} onClick={() => setActivity(label)}>{label}</button>)}</div>
      {activityBody()}
      <div className="p-section-title"><h2><ShoppingBag size={19} />Do‘kon xabarlari</h2><button className="p-link" onClick={() => p.onNavigate("store:messages")}>Ochish <ArrowRight size={15} /></button></div><div className="p-message-note">Buyurtmalar va do‘kon savollari Book Store hisobida.</div>
  </>;
  const accountItems: MenuItem[] = [
    { id: "account", title: "Shaxsiy ma’lumotlar", icon: UserRound, tone: "firuza", onClick: () => open("account") },
    { id: "activity", title: "Faollik", icon: Activity, tone: "anor", onClick: () => open("activity") },
    { id: "shelf", title: "Saqlangan kitoblar", icon: Bookmark, tone: "tilla", value: String(p.shelfCount), onClick: () => p.onNavigate("shelf") },
    { id: "store", title: "Xaridlarim", icon: ShoppingBag, tone: "yashil", onClick: () => p.onNavigate("store:cart") },
  ];
  const securityItems: MenuItem[] = [
    { id: "privacy", title: "Maxfiylik va xavfsizlik", icon: ShieldCheck, tone: "firuza", onClick: () => open("privacy") },
  ];
  if (viewer?.signedIn) securityItems.push({ id: "twofactor", title: "Ikki bosqichli himoya", icon: Lock, tone: "tilla", value: viewer.twoFactor ? "Yoqilgan" : "O‘chiq", onClick: () => open("twofactor") });
  if (viewer?.accounts.some(a => a.provider === "email")) securityItems.push({ id: "password", title: viewer.hasPassword ? "Parolni o‘zgartirish" : "Parol o‘rnatish", icon: KeyRound, tone: "kulrang", onClick: () => open("password") });
  const adminItems: MenuItem[] = role === "admin"
    ? [
        { id: "admin", title: "Boshqaruv paneli", icon: Crown, tone: "tilla", value: "Rollar", onClick: () => open("admin") },
        { id: "site", title: "Ijtimoiy tarmoqlar", icon: Globe, tone: "firuza", value: "Havolalar", onClick: () => open("site") },
        { id: "team", title: "Jamoa", icon: Users, tone: "yashil", value: "A‘zolar", onClick: () => open("team") },
        { id: "aboutAdmin", title: "Biz haqimizda tahriri", icon: Info, tone: "lojuvard", value: "Video, hisob", onClick: () => open("aboutAdmin") },
      ]
    : [];
  if (canModerate(role)) adminItems.push({ id: "quizzes", title: "Viktorinalar", icon: ListChecks, tone: "binafsha", value: "Savollar", onClick: () => open("quizzes") });
  const menuGroups: MenuGroup[] = [
    { id: "account", title: "Shaxsiy hisob", items: accountItems },
    { id: "settings", title: "Sozlamalar", items: [
      { id: "notifications", title: "Bildirishnomalar", icon: ScrollIcon, tone: "binafsha", onClick: p.onNotifications },
      { id: "language", title: "Ilova tili", icon: Languages, tone: "lojuvard", value: "O‘zbekcha" },
      { id: "devices", title: "Kamera va mikrofon", icon: Camera, tone: "pushti", onClick: () => open("devices") },
      ...(installable ? [{ id: "install", title: "Ilovani o‘rnatish", icon: Download, tone: "firuza", value: "Bosh ekranga", onClick: () => void requestInstall() } satisfies MenuItem] : []),
      ...(viewer?.signedIn ? [{ id: "link", title: "Boshqa qurilmani ulash", icon: Smartphone, tone: "yashil", onClick: () => setLinkOpen(true) } satisfies MenuItem] : []),
    ] },
    { id: "security", title: "Xavfsizlik", items: securityItems },
    ...(adminItems.length ? [{ id: "admin", title: "Boshqaruv", items: adminItems }] : []),
    { id: "help", title: "Yordam", items: [
      { id: "faq", title: "Ko‘p so‘raladigan savollar", icon: CircleHelp, tone: "lojuvard", onClick: () => open("faq") },
      { id: "about", title: "Biz haqimizda", icon: Info, tone: "pushti", value: "Jamoa, video", onClick: () => p.onNavigate("about") },
      { id: "support", title: "Biz bilan bog‘lanish", icon: MessageCircle, tone: "yashil", onClick: () => p.onNavigate("store:messages") },
    ] },
    ...(viewer && viewer.accounts.length > 0 ? [{ id: "exit", title: "Chiqish", items: [{ id: "signout", title: "Hisobdan chiqish", icon: LogOut, tone: "anor", danger: true, onClick: signOut } satisfies MenuItem] }] : []),
  ];
  const settingsView = <ProfileMenu groups={menuGroups} footer={<>
      <SocialLinks />
      <div className="p-settings-brand"><BookOpen size={23} /><strong>BIR ILM</strong><span>Bir hafta. Bir kitob. Bir qadam oldinga.</span><small>Ilova versiyasi 0.1.0</small></div>
    </>} />;

  // Ro'yxatdan o'tmaganlarga shaxsiy sahifada hech narsa ko'rsatilmaydi: faqat kirish va ro'yxatdan o'tish.
  if (!viewer) return <section className="profile-space p-guest" aria-busy="true" />;
  if (!viewer.signedIn) {
    return <section className="profile-space p-guest">
      <div className="p-guest-gate">
        <h1>Shaxsiy sahifa</h1>
        <button type="button" className="p-primary" onClick={() => setAuthOpen(true)}>Kirish yoki ro‘yxatdan o‘tish</button>
      </div>
      <LoginDialog viewer={viewer} open={authOpen} onOpenChange={setAuthOpen} />
    </section>;
  }

  return <section className={`profile-space p-view-${screen}`}>
    {screen === "profile" ? (
      <ProfileHero
        viewer={viewer}
        followers={status === "ready" ? social?.followers ?? 0 : null}
        following={status === "ready" ? social?.following.length ?? 0 : null}
        posts={status === "ready" ? social?.profile?.posts ?? 0 : null}
        points={p.points}
        rank={p.rank}
        onEdit={() => open("account")}
        onMenu={() => open("settings")}
        onFollows={() => { setActivity("Obunalar"); setTab("activity"); }}
        onPosts={() => setTab("posts")}
        onRank={() => p.onNavigate("leaders")}
      />
    ) : (
      <div className="p-top">
        <header className="p-header">
          <button className="p-icon" aria-label="Orqaga" onClick={() => open(backTo)}><ChevronLeft size={23} /></button>
          <h1>{titles[screen]}</h1>
          {screen === "activity" ? <button className="p-icon" aria-label="Xabarlar" onClick={() => p.onNavigate("store:messages")}><Mail size={22} /></button> : <span />}
        </header>
      </div>
    )}

    {screen === "profile" && <>
      <div className="p-tabs p-main-tabs" role="tablist" aria-label="Profil bo‘limlari">
        {PROFILE_TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}{id === "posts" && status === "ready" ? <i>{social?.profile?.posts ?? 0}</i> : id === "activity" && replies.length ? <i>{replies.length}</i> : null}</button>)}
      </div>
      {tab === "reading" && <div className="p-tab-panel">
        <div className="p-section-title"><h2><BookOpen size={19} />Mutolaa</h2><button className="p-link" onClick={() => p.onNavigate("shelf")}>Javonim <ArrowRight size={15} /></button></div>
        <div className="p-reading-stats"><span><BookOpen size={17} /><b>{p.shelfCount}</b><small>Kitob</small></span><span><MessageCircle size={17} /><b>{count(social?.sessions)}</b><small>Fokus seansi</small></span><span><ChartNoAxesColumnIncreasing size={17} /><b>{p.streak}</b><small>Kunlik streak</small></span></div>
        <div className="p-section-title"><h2><CalendarDays size={19} />Bo‘lib o‘tadigan suhbat</h2><button className="p-link" onClick={() => p.onNavigate("talks")}>Barchasi <ArrowRight size={15} /></button></div>
        <button className="p-event" onClick={() => p.onNavigate("talks")}><Cover small book={featured} /><span><small><CalendarDays size={13} /> Jonli suhbatlar</small><strong>{featured?.title ?? "Kitob muhokamasi"}</strong><span>Bir kitob, turli qarashlar.</span><b>Suhbatga o‘tish <ArrowRight size={14} /></b></span><ChevronRight size={18} /></button>
        <div className="p-menu"><Row icon={<Bookmark />} title="Saqlangan kitoblar" value={p.shelfCount} onClick={() => p.onNavigate("shelf")} /></div>
      </div>}
      {tab === "posts" && <div className="p-tab-panel"><ReadingDashboard mode="profile" name={p.name} pages={p.page} shelfCount={p.shelfCount} streak={p.streak} /></div>}
      {tab === "activity" && <div className="p-tab-panel">{activityView}</div>}
    </>}

    {screen === "activity" && <>{activityView}</>}

    {screen === "settings" && settingsView}
    <LinkDeviceDialog open={linkOpen} onClose={() => setLinkOpen(false)} />
    {screen === "password" && <div className="p-settings"><ChangePasswordForm hasPassword={Boolean(viewer?.hasPassword)} /></div>}
    {screen === "admin" && (role === "admin" && viewer ? <AdminPanel selfId={viewer.userId} /> : <div className="p-empty"><ShieldCheck /><h2>Ruxsat yo‘q</h2><p>Bu bo‘lim faqat adminlar uchun.</p></div>)}
    {screen === "account" && (viewer ? <AccountEditor viewer={viewer} onRename={p.onRename} /> : <div className="p-empty"><UserRound /><h2>Yuklanmoqda…</h2></div>)}
    {screen === "twofactor" && (viewer?.signedIn ? <div className="p-settings"><TwoFactorSettings viewer={viewer} /></div> : <div className="p-empty"><Lock /><h2>Avval hisobga kiring</h2><p>Xavfsizlik kodi email, Google yoki Telegram bilan kirgan hisob uchun qo‘yiladi.</p></div>)}
    {screen === "quizzes" && (canModerate(role) ? <AdminQuizzes /> : <div className="p-empty"><ShieldCheck /><h2>Ruxsat yo‘q</h2><p>Bu bo‘lim faqat adminlar uchun.</p></div>)}
    {screen === "devices" && <DeviceSettings />}
    {screen === "site" && (role === "admin" ? <AdminSite /> : <div className="p-empty"><ShieldCheck /><h2>Ruxsat yo‘q</h2><p>Bu bo‘lim faqat adminlar uchun.</p></div>)}
    {screen === "team" && (role === "admin" ? <AdminTeam /> : <div className="p-empty"><ShieldCheck /><h2>Ruxsat yo‘q</h2><p>Bu bo‘lim faqat adminlar uchun.</p></div>)}
    {screen === "aboutAdmin" && (role === "admin" ? <AdminAbout /> : <div className="p-empty"><ShieldCheck /><h2>Ruxsat yo‘q</h2><p>Bu bo‘lim faqat adminlar uchun.</p></div>)}
    {screen === "posts" && <ReadingDashboard mode="profile" name={p.name} pages={p.page} shelfCount={p.shelfCount} streak={p.streak} />}
    {screen === "privacy" && <div className="p-info"><ShieldCheck /><h2>Ma’lumotlaringiz haqida</h2><p>Mutolaa jarayoni va ilova sozlamalari ushbu brauzerda saqlanadi. Postlar, javoblar va obunalar xizmat bazasida saqlanadi.</p><p>Postlaringizni “Mening postlarim” bo‘limida boshqarishingiz mumkin. Brauzer ma’lumotlarini o‘chirish qurilmada saqlangan jarayonga kirishni yo‘qotishi mumkin.</p></div>}
    {screen === "faq" && <div className="p-faq">{[["Mutolaa jarayonini qanday yangilayman?", "Shaxsiy sahifadagi «Hozirgi mutolaa» kartasini bosing va o‘qilgan sahifa sonini kiriting."], ["Kitobni qanday saqlayman?", "Javonim bo‘limida kitobni tanlab, javonga qo‘shish tugmasini bosing."], ["Suhbatga qanday qo‘shilaman?", "Suhbatlar bo‘limini oching. U yerda jonli suhbat va muhokamalarni topasiz."]].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>}
  </section>;
}

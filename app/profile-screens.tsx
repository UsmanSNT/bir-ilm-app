"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Bell, BookOpen, Bookmark, CalendarDays, ChartNoAxesColumnIncreasing, ChevronLeft, ChevronRight, CircleHelp, Copy, Crown, Globe, Heart, Info, LogOut, Mail, MessageCircle, NotebookPen, Settings, ShieldCheck, Sparkles, Trophy, UserRound, Users } from "lucide-react";
import { useViewer } from "@/lib/api/roles-client";
import { useCatalog } from "@/lib/api/books-client";
import type { Book } from "@/shared/contract";
import { USER_ROLE_LABELS } from "@/shared/contract/roles";
import AdminPanel from "./admin-panel";
import LoginCard from "./login-card";
import ReadingDashboard from "./reading-dashboard";
import type { SocialData } from "./social-types";

type Props = { name: string; page: number; total: number; shelfCount: number; streak: number; rank: number; onNavigate: (tab: string) => void; onEdit: () => void; onProgress: () => void; onNotifications: () => void };
type Screen = "profile" | "activity" | "settings" | "posts" | "messages" | "privacy" | "faq" | "about" | "admin";

function Cover({ small = false, book }: { small?: boolean; book: Book | null }) {
  if (book?.coverUrl) return <span className={`p-book p-book-image ${small ? "p-book-small" : ""}`} aria-hidden="true"><img src={book.coverUrl} alt="" /></span>;
  return <span className={`p-book ${small ? "p-book-small" : ""}`} style={book ? { background: book.color, color: "#fff" } : undefined} aria-hidden="true"><small>BIR ILM</small><strong>{book?.title ?? "Tez orada"}</strong><span>{book ? "Hafta kitobi" : ""}</span><b>{book?.author ?? ""}</b></span>;
}

function Row({ icon, title, value, onClick }: { icon: ReactNode; title: string; value?: ReactNode; onClick: () => void }) {
  return <button type="button" className="p-row" onClick={onClick}><span className="p-row-icon">{icon}</span><span>{title}</span>{value != null && <small>{value}</small>}<ChevronRight size={17} /></button>;
}

export default function ProfileScreens(p: Props) {
  const [screen, setScreen] = useState<Screen>("profile");
  const [activity, setActivity] = useState("Javoblar");
  const [social, setSocial] = useState<SocialData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [copied, setCopied] = useState(false);
  const viewer = useViewer();
  const featured = useCatalog().active;
  const role = viewer?.role ?? "user";
  const copyId = () => {
    if (!viewer) return;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    // navigator.clipboard faqat HTTPS'da bor; oddiy HTTP uchun eski usul.
    if (navigator.clipboard) { navigator.clipboard.writeText(viewer.userId).then(done).catch(() => {}); return; }
    const area = document.createElement("textarea");
    area.value = viewer.userId;
    document.body.appendChild(area);
    area.select();
    if (document.execCommand("copy")) done();
    area.remove();
  };
  const signOut = async () => {
    if (!window.confirm("Hisobdan chiqasizmi? Qayta kirish uchun Google yoki Telegram kerak bo‘ladi.")) return;
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    window.location.assign("/");
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/social?scope=mine", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error();
      const data = await response.json() as SocialData;
      if (!controller.signal.aborted) { setSocial(data); setStatus("ready"); }
    }).catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [retry, screen]);
  const open = (next: Screen) => { setScreen(next); window.scrollTo({ top: 0, behavior: "instant" }); };
  const percent = Math.min(100, Math.max(0, Math.round(p.page / Math.max(1, p.total) * 100)));
  const replies = (social?.posts ?? []).flatMap(post => post.replies.filter(reply => reply.name !== p.name).map(reply => ({ ...reply, book: post.book }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const titles: Record<Screen, string> = { profile: "Shaxsiy sahifa", activity: "Faollik", settings: "Sozlamalar", posts: "Mening postlarim", messages: "Xabarlar", privacy: "Maxfiylik va xavfsizlik", faq: "Ko‘p so‘raladigan savollar", about: "Bir Ilm haqida", admin: "Boshqaruv paneli" };
  const count = (value: number | undefined) => status === "ready" ? value ?? 0 : "—";

  return <section className={`profile-space p-view-${screen}`}>
    <header className="p-header">
      {screen === "profile" ? <span className="p-brand-mark"><BookOpen size={21} /></span> : <button className="p-icon" aria-label="Orqaga" onClick={() => open(["privacy", "faq", "about"].includes(screen) ? "settings" : "profile")}><ChevronLeft size={23} /></button>}
      <h1>{titles[screen]}</h1>
      {screen === "profile" ? <button className="p-icon" aria-label="Sozlamalar" onClick={() => open("settings")}><Settings size={23} /></button> : screen === "activity" ? <button className="p-icon" aria-label="Xabarlar" onClick={() => open("messages")}><Mail size={22} /></button> : <span />}
    </header>

    {screen === "profile" && <>
      <div className="p-identity"><div className="p-avatar">{p.name.trim().slice(0, 1).toUpperCase() || "K"}<span><BookOpen size={13} /></span></div><div><span className="p-eyebrow">BIR ILM KITOBXONI{role !== "user" && <span className={`p-role-badge role-${role}`}>{role === "admin" ? <Crown size={11} /> : <ShieldCheck size={11} />}{USER_ROLE_LABELS[role]}</span>}</span><h2>{p.name || "Kitobxon"}</h2><p>{social?.profile?.bio || "Har kuni bir sahifa oldinga."}</p><button className="p-link" onClick={p.onEdit}>Profilni tahrirlash <ArrowRight size={15} /></button></div></div>
      {viewer && viewer.accounts.length === 0 && <LoginCard viewer={viewer} />}
      <div className="p-stats"><button onClick={() => { setActivity("Obunalar"); open("activity"); }}><strong>{count(social?.followers)}</strong><span>Obunachilar</span></button><button onClick={() => { setActivity("Obunalar"); open("activity"); }}><strong>{count(social?.following.length)}</strong><span>Obunalar</span></button><button onClick={() => open("posts")}><strong>{count(social?.profile?.posts)}</strong><span>Postlar</span></button></div>
      <div className="p-columns"><div>
        <div className="p-section-title"><h2><BookOpen size={19} />Mutolaa</h2><button className="p-link" onClick={() => p.onNavigate("shelf")}>Javonim <ArrowRight size={15} /></button></div>
        <button className="p-reading" onClick={p.onProgress}><Cover book={featured} /><span className="p-reading-info"><small>HOZIRGI MUTOLAA</small><strong>{featured?.title ?? "Haftaning kitobi hali yo‘q"}</strong><span>{featured?.author ?? ""}</span><span className="p-progress"><span><i style={{ width: `${percent}%` }} /></span><b>{percent}%</b></span><span className="p-page-count">{p.page} / {p.total} sahifa <ArrowRight size={14} /></span></span></button>
        <div className="p-reading-stats"><span><BookOpen size={17} /><b>{p.shelfCount}</b><small>Kitob</small></span><span><MessageCircle size={17} /><b>{count(social?.sessions)}</b><small>Fokus seansi</small></span><span><ChartNoAxesColumnIncreasing size={17} /><b>{p.streak}</b><small>Kunlik streak</small></span></div>
        {role === "admin" && <div className="p-menu p-admin-entry"><Row icon={<Crown />} title="Boshqaruv paneli" value="Rollar" onClick={() => open("admin")} /></div>}
        <div className="p-menu"><Row icon={<NotebookPen />} title="Mening postlarim" value={count(social?.profile?.posts)} onClick={() => open("posts")} /><Row icon={<MessageCircle />} title="Javoblar va faollik" value={replies.length || undefined} onClick={() => { setActivity("Javoblar"); open("activity"); }} /><Row icon={<Mail />} title="Xabarlar" onClick={() => open("messages")} /><Row icon={<Bookmark />} title="Saqlangan kitoblar" value={p.shelfCount} onClick={() => p.onNavigate("shelf")} /></div>
      </div><div>
        <div className="p-section-title"><h2><CalendarDays size={19} />Bo‘lib o‘tadigan suhbat</h2><button className="p-link" onClick={() => p.onNavigate("talks")}>Barchasi <ArrowRight size={15} /></button></div>
        <button className="p-event" onClick={() => p.onNavigate("talks")}><Cover small book={featured} /><span><small><CalendarDays size={13} /> Jonli suhbatlar</small><strong>{featured?.title ?? "Kitob muhokamasi"}</strong><span>Bir kitob, turli qarashlar.</span><b>Suhbatga o‘tish <ArrowRight size={14} /></b></span><ChevronRight size={18} /></button>
        <button className="p-rank" onClick={() => p.onNavigate("leaders")}><span className="p-trophy"><Trophy size={22} /></span><span><strong>Birga o‘sish — yanada oson</strong><small>Faollar reytingidagi o‘rningiz</small></span><b>#{p.rank}</b></button>
        <div className="p-footer-note"><Sparkles size={16} /><p>Katta o‘zgarishlar<br /><strong>kichik odatlardan boshlanadi.</strong></p></div>
      </div></div>
    </>}

    {screen === "activity" && <>
      <div className="p-tabs" role="tablist" aria-label="Faollik turi">{["Javoblar", "Reaksiyalar", "Obunalar"].map(label => <button key={label} role="tab" aria-selected={activity === label} onClick={() => setActivity(label)}>{label}</button>)}</div>
      {status !== "ready" ? <div className="p-empty"><Bell /><h2>{status === "loading" ? "Faollik yuklanmoqda…" : "Faollikni yuklab bo‘lmadi"}</h2>{status === "error" && <button className="p-link" onClick={() => { setStatus("loading"); setRetry(v => v + 1); }}>Qayta urinish <ArrowRight size={15} /></button>}</div> : activity === "Javoblar" && replies.length > 0 ? <div className="p-activity-list"><p className="p-list-label">So‘nggi javoblar</p>{replies.map(reply => <button className="p-activity-row" key={reply.id} onClick={() => open("posts")}><span className="p-small-avatar">{reply.name[0]}</span><span><strong>{reply.name}</strong> postingizga javob berdi<time>{new Date(reply.createdAt).toLocaleDateString("uz-UZ")}</time><p>“{reply.body}”</p><small><BookOpen size={13} />{reply.book}</small></span><ChevronRight size={16} /></button>)}</div> : activity === "Obunalar" && Boolean(social?.following.length) ? <div className="p-activity-list"><p className="p-list-label">Siz kuzatayotgan kitobxonlar</p>{social?.following.map(id => { const reader = social.readers.find(item => item.id === id); return <div className="p-activity-row" key={id}><span className="p-small-avatar">{reader?.name[0] || "K"}</span><span><strong>{reader?.name || "Kitobxon"}</strong><p>{reader?.bio || "Bir Ilm hamjamiyati a’zosi"}</p></span><Users size={18} /></div>; })}</div> : <div className="p-empty">{activity === "Reaksiyalar" ? <Heart /> : activity === "Obunalar" ? <Users /> : <MessageCircle />}<h2>{activity === "Reaksiyalar" ? "Reaksiyalar tez orada" : activity === "Obunalar" ? "Yangi tanishuvlar oldinda" : "Suhbat shu yerdan boshlanadi"}</h2><p>{activity === "Reaksiyalar" ? "Postlarga bildirilgan reaksiyalar shu yerda ko‘rinadi. Bu imkoniyat hali ulanmagan." : activity === "Obunalar" ? "Siz kuzatgan kitobxonlar shu yerda jamlanadi." : "Postlaringizga kelgan javoblar shu yerda paydo bo‘ladi. Birinchi fikringizni ulashing."}</p><button className="p-primary" onClick={() => p.onNavigate("community")}>Hamjamiyatga o‘tish <ArrowRight size={16} /></button></div>}
      <div className="p-section-title"><h2><Mail size={19} />Xabarlar</h2><button className="p-link" onClick={() => open("messages")}>Barchasi <ArrowRight size={15} /></button></div><div className="p-message-note">Kitoblar haqida yangi suhbatlar uchun joy.</div>
    </>}

    {screen === "settings" && <div className="p-settings">
      <p className="p-settings-intro">O‘zingizga mos mutolaa muhiti.</p>
      <h2>Hisob</h2><div className="p-menu"><Row icon={<UserRound />} title="Shaxsiy ma’lumotlar" onClick={p.onEdit} /><Row icon={<ShieldCheck />} title="Maxfiylik va xavfsizlik" onClick={() => open("privacy")} /><Row icon={<Copy />} title={copied ? "Nusxa olindi" : "Hisob ID"} value={viewer ? `${viewer.userId.slice(7, 15)}… · ${USER_ROLE_LABELS[role]}` : "—"} onClick={copyId} />{viewer?.accounts.map(a => <div key={a.provider} className="p-row p-static"><span className="p-row-icon"><ShieldCheck /></span><span>{a.provider === "google" ? "Google" : "Telegram"}</span><small>{a.label}</small></div>)}{viewer && viewer.accounts.length > 0 && <Row icon={<LogOut />} title="Chiqish" onClick={signOut} />}</div>
      {viewer && viewer.accounts.length === 0 && <LoginCard viewer={viewer} />}
      <h2>Ilova</h2><div className="p-menu"><Row icon={<Bell />} title="Bildirishnomalar" onClick={p.onNotifications} /><div className="p-row p-static"><span className="p-row-icon"><Globe /></span><span>Til</span><small>O‘zbekcha</small></div><Row icon={<BookOpen />} title="Mutolaa rejasi" onClick={p.onProgress} /></div>
      <h2>Yordam</h2><div className="p-menu"><Row icon={<CircleHelp />} title="Ko‘p so‘raladigan savollar" onClick={() => open("faq")} /><Row icon={<Info />} title="Loyiha haqida" onClick={() => open("about")} /></div>
      <div className="p-settings-brand"><BookOpen size={23} /><strong>BIR ILM</strong><span>Bir hafta. Bir kitob. Bir qadam oldinga.</span><small>Ilova versiyasi 0.1.0</small></div>
    </div>}
    {screen === "admin" && (role === "admin" && viewer ? <AdminPanel selfId={viewer.userId} /> : <div className="p-empty"><ShieldCheck /><h2>Ruxsat yo‘q</h2><p>Bu bo‘lim faqat adminlar uchun.</p></div>)}
    {screen === "posts" && <ReadingDashboard mode="profile" name={p.name} pages={p.page} shelfCount={p.shelfCount} streak={p.streak} />}
    {screen === "messages" && <div className="p-empty"><Mail /><h2>Yaxshi suhbat — bir xabardan</h2><p>Shaxsiy yozishmalar hali ishga tushirilmagan. Hozir kitobxonlar bilan hamjamiyatda fikr almashishingiz mumkin.</p><button className="p-primary" onClick={() => p.onNavigate("community")}>Hamjamiyatga o‘tish <ArrowRight size={16} /></button></div>}
    {screen === "privacy" && <div className="p-info"><ShieldCheck /><h2>Ma’lumotlaringiz haqida</h2><p>Mutolaa jarayoni va ilova sozlamalari ushbu brauzerda saqlanadi. Postlar, javoblar va obunalar xizmat bazasida saqlanadi.</p><p>Postlaringizni “Mening postlarim” bo‘limida boshqarishingiz mumkin. Brauzer ma’lumotlarini o‘chirish qurilmada saqlangan jarayonga kirishni yo‘qotishi mumkin.</p></div>}
    {screen === "faq" && <div className="p-faq">{[["Mutolaa jarayonini qanday yangilayman?", "Shaxsiy sahifadagi «Hozirgi mutolaa» kartasini bosing va o‘qilgan sahifa sonini kiriting."], ["Kitobni qanday saqlayman?", "Javonim bo‘limida kitobni tanlab, javonga qo‘shish tugmasini bosing."], ["Suhbatga qanday qo‘shilaman?", "Suhbatlar bo‘limini oching. U yerda jonli suhbat va muhokamalarni topasiz."]].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>}
    {screen === "about" && <div className="p-info"><BookOpen /><h2>Bir kitob atrofida birlashamiz.</h2><p>Bir Ilm — mutolaani kundalik odatga aylantirish, fikr almashish va birga o‘sish uchun kitobxonlar hamjamiyati.</p><p>Har hafta bitta kitob. Har kuni yangi fikr.</p></div>}
  </section>;
}

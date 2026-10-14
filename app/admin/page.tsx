import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import { getSession } from "@/app/server/session";
import "./admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Bir Ilm", robots: { index: false, follow: false } };

const PAGE_SIZE = 25;

type Visitor = { id: string; firstSeen: string; lastSeen: string; visits: number; country: string | null; device: string | null };
type MemberRow = { name: string; registeredAt: string; posts: number; replies: number };
type Totals = { total: number; day: number; fresh: number; visits: number; members: number };

// SQLite CURRENT_TIMESTAMP is UTC "YYYY-MM-DD HH:MM:SS".
const fmt = (value: string) => new Date(value.replace(" ", "T") + "Z").toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent", dateStyle: "short", timeStyle: "short" });

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getSession(await headers());
  if (session.kind === "visitor") redirect(chatGPTSignInPath("/admin"));
  if (!session.admin) notFound();

  const db = env.DB;
  if (!db) return <main className="admin-page"><h1>Admin</h1><p className="admin-empty">Ma&apos;lumotlar bazasi ulanmagan.</p></main>;

  const requested = Number((await searchParams).page);
  const page = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 10_000) : 1;
  const [totals, visitors, members] = await Promise.all([
    db.prepare(`SELECT
      (SELECT count(*) FROM site_visitors) AS total,
      (SELECT count(*) FROM site_visitors WHERE last_seen >= datetime('now','-1 day')) AS day,
      (SELECT count(*) FROM site_visitors WHERE first_seen >= datetime('now','-1 day')) AS fresh,
      (SELECT COALESCE(sum(visits),0) FROM site_visitors) AS visits,
      (SELECT count(*) FROM users WHERE registered_at IS NOT NULL) AS members`).first<Totals>(),
    db.prepare("SELECT id, first_seen AS firstSeen, last_seen AS lastSeen, visits, country, device FROM site_visitors ORDER BY last_seen DESC LIMIT ? OFFSET ?").bind(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE).all<Visitor>(),
    db.prepare(`SELECT u.name, u.registered_at AS registeredAt,
      (SELECT count(*) FROM reading_posts p WHERE p.user_id=u.id) AS posts,
      (SELECT count(*) FROM post_replies r WHERE r.user_id=u.id) AS replies
      FROM users u WHERE u.registered_at IS NOT NULL ORDER BY u.registered_at DESC LIMIT 100`).all<MemberRow>(),
  ]);
  const rows = visitors.results.slice(0, PAGE_SIZE);
  const hasNext = visitors.results.length > PAGE_SIZE;

  return <main className="admin-page">
    <h1>Admin panel</h1>
    <p className="admin-sub">Sahifaga tashrif buyurganlar (anonim) va ro&apos;yxatdan o&apos;tgan a&apos;zolar alohida hisoblanadi. Vaqt: Toshkent.</p>
    <section className="admin-stats" aria-label="Umumiy ko'rsatkichlar">
      <div><strong>{totals?.total ?? 0}</strong><span>Jami tashrif buyuruvchilar</span></div>
      <div><strong>{totals?.day ?? 0}</strong><span>So&apos;nggi 24 soatda faol</span></div>
      <div><strong>{totals?.fresh ?? 0}</strong><span>Yangi (24 soat)</span></div>
      <div><strong>{totals?.visits ?? 0}</strong><span>Jami tashriflar</span></div>
      <div><strong>{totals?.members ?? 0}</strong><span>Ro&apos;yxatdan o&apos;tganlar</span></div>
    </section>

    <h2>Sahifaga tashrif buyurganlar</h2>
    <div className="admin-table-wrap">
      {rows.length ? <table className="admin-table">
        <thead><tr><th>Tashrif ID</th><th>Birinchi kirish</th><th>Oxirgi kirish</th><th>Tashriflar</th><th>Mamlakat</th><th>Qurilma</th></tr></thead>
        <tbody>{rows.map(v => <tr key={v.id}><td>{v.id.slice(2, 10)}</td><td>{fmt(v.firstSeen)}</td><td>{fmt(v.lastSeen)}</td><td>{v.visits}</td><td>{v.country ?? "—"}</td><td>{v.device ?? "—"}</td></tr>)}</tbody>
      </table> : <p className="admin-empty">Hali tashrif buyuruvchilar yo&apos;q.</p>}
    </div>
    <nav className="admin-pager" aria-label="Sahifalash">
      {page > 1 && <Link href={`/admin?page=${page - 1}`}>← Oldingi</Link>}
      <span>{page}-sahifa</span>
      {hasNext && <Link href={`/admin?page=${page + 1}`}>Keyingi →</Link>}
    </nav>

    <h2>Ro&apos;yxatdan o&apos;tganlar (chat va imkoniyatlar ochiq)</h2>
    <div className="admin-table-wrap">
      {members.results.length ? <table className="admin-table">
        <thead><tr><th>Ism</th><th>Ro&apos;yxatdan o&apos;tgan</th><th>Postlar</th><th>Izohlar</th></tr></thead>
        <tbody>{members.results.map(m => <tr key={m.registeredAt + m.name}><td>{m.name}</td><td>{fmt(m.registeredAt)}</td><td>{m.posts}</td><td>{m.replies}</td></tr>)}</tbody>
      </table> : <p className="admin-empty">Hali ro&apos;yxatdan o&apos;tganlar yo&apos;q.</p>}
    </div>
  </main>;
}

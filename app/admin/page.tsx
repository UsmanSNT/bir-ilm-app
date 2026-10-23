import { redirect } from "next/navigation";
import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
import { isAdminEmail } from "@/lib/admin";
import AdminDashboard from "./admin-dashboard";

export const metadata = { title: "Admin panel — Bir Ilm", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getChatGPTUser();
  if (!user) redirect(chatGPTSignInPath("/admin"));
  if (!(await isAdminEmail(user.email))) {
    return (
      <main className="admin-denied">
        <h1>Ruxsat yo&apos;q</h1>
        <p>{user.email} admin ro&apos;yxatida emas.</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- to'liq sahifa yuklash kerak */}
        <a href="/">Bosh sahifaga qaytish</a>
      </main>
    );
  }
  return <AdminDashboard email={user.email} />;
}

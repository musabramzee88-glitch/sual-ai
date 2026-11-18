import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { LogoutButton } from "@/components/AuthForms";
import { getDictionary } from "@/lib/i18n/server";
import Link from "next/link";
import { loadAdmin } from "@/server/admin/guard";
import { getAuth } from "@/server/auth/session";

export const metadata = { title: "لوحة المدرس" };

/** التحقق الفعلي من الجلسة والوصول يتم هنا على الخادم (الـ middleware حجب أولي فقط). */
export default async function Page() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const { t } = await getDictionary();
  const isAdmin = !!(await loadAdmin(auth));
  return (
    <AuthShell brand={t.brand} title={t.dashboard.title}>
      <div className="space-y-4">
        <p>{t.dashboard.hello}، <strong>{auth.user.fullName}</strong></p>
        <p className="text-sm"><span className="text-muted">{t.dashboard.status}: </span><strong>{t.dashboard.states[auth.access]}</strong></p>
        {!auth.user.phoneVerified && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">{t.dashboard.phonePending}</p>}
        <div className="flex flex-wrap gap-2">
          {auth.access !== "BANNED" && auth.access !== "ACCOUNT_SUSPENDED" && <Link href="/subscribe" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-paper">{t.subscribe.toSubscribe}</Link>}
          {isAdmin && <Link href="/admin" className="rounded-lg border border-line px-4 py-2 text-sm">{t.subscribe.adminPanel}</Link>}
          <LogoutButton t={t.auth} />
        </div>
      </div>
    </AuthShell>
  );
}

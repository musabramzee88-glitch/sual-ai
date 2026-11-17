import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { LogoutButton } from "@/components/AuthForms";
import { getDictionary } from "@/lib/i18n/server";
import { getAuth } from "@/server/auth/session";

export const metadata = { title: "لوحة المدرس" };

/** التحقق الفعلي من الجلسة والوصول يتم هنا على الخادم (الـ middleware حجب أولي فقط). */
export default async function Page() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const { t } = await getDictionary();
  return (
    <AuthShell brand={t.brand} title={t.dashboard.title}>
      <div className="space-y-4">
        <p>{t.dashboard.hello}، <strong>{auth.user.fullName}</strong></p>
        <p className="text-sm"><span className="text-muted">{t.dashboard.status}: </span><strong>{t.dashboard.states[auth.access]}</strong></p>
        {!auth.user.phoneVerified && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">{t.dashboard.phonePending}</p>}
        <LogoutButton t={t.auth} />
      </div>
    </AuthShell>
  );
}

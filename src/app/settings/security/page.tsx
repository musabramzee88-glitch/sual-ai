import Link from "next/link";
import { redirect } from "next/navigation";
import { ShellCard, TeacherShell } from "@/components/TeacherShell";
import { SecuritySettings } from "@/components/SecuritySettings";
import { DeleteAccount } from "@/components/DeleteAccount";
import { getDictionary } from "@/lib/i18n/server";
import { getAuth } from "@/server/auth/session";
import { smsAvailable } from "@/server/auth/sms";

export const metadata = { title: "الأمان" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const { t, locale } = await getDictionary();
  const u = auth.user;
  return (
    <TeacherShell narrow><ShellCard title={t.security.title}>
      <SecuritySettings t={t.security} a={t.auth} state={{ loginSecurity: u.loginSecurity, emailVerified: u.emailVerified, phoneVerified: u.phoneVerified, smsAvailable: smsAvailable() }} />
 {u.role === "TEACHER" && <DeleteAccount locale={locale} />}
      <Link href="/dashboard" className="mt-5 inline-block text-sm text-brand">{t.security.back}</Link>
    </ShellCard></TeacherShell>
  );
}

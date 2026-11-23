import Link from "next/link";
import { Logo } from "./Logo";
import { AppNav } from "./AppNav";
import { getDictionary } from "@/lib/i18n/server";
import { navDicts } from "@/lib/i18n/nav";
import { getAuth } from "@/server/auth/session";
import { loadAdmin } from "@/server/admin/guard";
import { canUseExams } from "@/server/exams/access";

/** غلاف صفحات المدرس: الشعار والتنقل الموحّد (علوي على الحاسوب، سفلي على الهاتف). الصلاحيات تُفحص في كل صفحة على الخادم أيضاً. */
export async function TeacherShell({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  const { t, locale } = await getDictionary();
  const auth = await getAuth();
  const [isAdmin, canExams] = auth ? await Promise.all([loadAdmin(auth).then((a) => !!a), canUseExams(auth)]) : [false, false];
  return (
    <div className="min-h-dvh pb-24 md:pb-8 print:pb-0">
      <header className="border-b border-line bg-surface/70 print:hidden">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/dashboard" className="text-ink"><Logo label={t.brand} /></Link>
          <AppNav t={navDicts[locale]} isAdmin={isAdmin} canExams={canExams} />
        </div>
      </header>
      <main className={`mx-auto w-full ${narrow ? "max-w-lg" : "max-w-5xl"} px-4 py-6 print:max-w-none print:p-0`}>{children}</main>
    </div>
  );
}

/** بطاقة بعنوان داخل الغلاف (لصفحات الحساب والاشتراك) */
export function ShellCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
      <h1 className="mb-5 text-xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

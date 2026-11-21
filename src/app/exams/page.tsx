import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";
import { canUseExams } from "@/server/exams/access";
import { listExams } from "@/server/exams/service";
import { getLocale } from "@/lib/i18n/server";
import { examDicts } from "@/lib/i18n/exams";

export const metadata = { title: "امتحاناتي" };

export default async function Page() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const locale = await getLocale();
  const t = examDicts[locale];
  if (!(await canUseExams(auth))) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="mb-4">{t.noAccess}</p>
        <Link href="/subscribe" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-paper">{t.subscribe}</Link>
      </div>
    );
  }
  const exams = await listExams(auth.user.id);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <div className="flex gap-2">
          <Link href="/exams/templates" className="rounded-lg border border-line px-4 py-2 text-sm">{t.templates}</Link>
          <Link href="/exams/new" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-paper">{t.newExam}</Link>
        </div>
      </div>
      {exams.length === 0 ? <p className="rounded-xl border border-line bg-surface p-6 text-center text-muted">{t.empty}</p> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {exams.map((e) => (
            <li key={e.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold" dir="auto">{e.title}</p>
                <p className="text-xs text-muted">{locale === "en" ? e.grade.nameEn : e.grade.nameAr} · {new Date(e.createdAt).toLocaleDateString("en-GB")} · {e.totalMarks} {t.marksShort}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${e.status === "READY" ? "bg-brand-soft text-brand" : e.status === "FAILED" ? "bg-accent-soft text-danger" : "text-muted"}`}>{t.status[e.status]}</span>
              <Link href={`/exams/${e.id}`} className="rounded-lg border border-line px-3 py-1">{t.open}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

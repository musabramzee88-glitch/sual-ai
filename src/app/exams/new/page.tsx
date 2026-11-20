import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";
import { canUseExams } from "@/server/exams/access";
import { examOptions } from "@/server/exams/service";
import { GENERATABLE } from "@/server/exams/core";
import { getLocale } from "@/lib/i18n/server";
import { examDicts } from "@/lib/i18n/exams";
import { ExamWizard, type WizardCurriculum } from "@/components/exams/ExamWizard";

export const metadata = { title: "امتحان جديد" };

export default async function Page() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!(await canUseExams(auth))) redirect("/exams");
  const locale = await getLocale();
  const t = examDicts[locale];
  const en = locale === "en";
  const options: WizardCurriculum[] = (await examOptions()).map((c) => ({
    id: c.id, title: c.title, kind: c.kind, part: c.part, pageCount: c.pageCount,
    grade: { code: c.grade.code, name: en ? c.grade.nameEn : c.grade.nameAr },
    subject: { code: c.subject.code, name: en ? c.subject.nameEn : c.subject.nameAr, types: c.subject.questionTypes },
    chapters: c.chapters,
  }));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t.wizard.title}</h1>
      <div className="rounded-2xl border border-line bg-surface p-5"><ExamWizard options={options} generatable={[...GENERATABLE]} t={t} /></div>
    </div>
  );
}

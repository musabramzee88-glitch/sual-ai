import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";
import { canUseExams } from "@/server/exams/access";
import { getExam } from "@/server/exams/service";
import { getLocale } from "@/lib/i18n/server";
import { examDicts } from "@/lib/i18n/exams";
import { ExamEditor, type EditorSection } from "@/components/exams/ExamEditor";
import { GENERATABLE } from "@/server/exams/core";

export const metadata = { title: "مراجعة الامتحان" };
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!(await canUseExams(auth))) redirect("/exams");
  const t = examDicts[await getLocale()];
  const exam = await getExam(auth.user.id, (await params).id);
  if (!exam) notFound();
  const s = exam.settings as { ocrPages?: number[]; imagePages?: number[]; truncated?: boolean; made?: number; sections?: { count: number }[] };
  const requested = (s.sections ?? []).reduce((n, x) => n + x.count, 0);
  const sections: EditorSection[] = exam.sections.map((p) => ({
    id: p.id, type: p.type ?? "ESSAY", instruction: p.instruction ?? p.prompt, marks: p.marks, answerCount: p.answerCount,
    branches: p.branches.map((q) => ({ id: q.id, prompt: q.prompt, options: (q.options as string[] | null) ?? null, answer: q.answer ?? "", marks: q.marks, sourcePages: q.sourcePages, version: q.version })),
  }));
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" dir="auto">{exam.title}</h1>
          <p className="text-sm text-muted">{t.status[exam.status]} · {t.total}: {exam.totalMarks} {t.marksShort}</p>
        </div>
        <Link href="/exams" className="text-sm text-muted">{t.title}</Link>
      </div>
      {exam.status === "FAILED" && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-danger">{t.editor.failed} {exam.jobs[0]?.error && /QUOTA|day/i.test(exam.jobs[0].error) ? t.errors.AI_QUOTA : ""}</p>}
      {s.made != null && s.made < requested && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">{fill(t.editor.shortfall, { r: requested, m: s.made })}</p>}
      {(s.imagePages?.length ?? 0) > 0 && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm">{fill(t.editor.ocrWarn, { n: s.imagePages!.length })}</p>}
      {s.truncated && <p className="text-xs text-muted">{t.editor.truncated}</p>}
      {exam.status === "READY" && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <ExamEditor examId={exam.id} title={exam.title} duration={exam.durationMinutes} totalMarks={exam.totalMarks} sectionsToAnswer={exam.sectionsToAnswer} firstRequired={exam.firstRequired} sections={sections} lang={exam.language} t={t}
            types={(exam.subject.questionTypes.length ? exam.subject.questionTypes : [...GENERATABLE]).filter((x) => (GENERATABLE as readonly string[]).includes(x))} />
        </div>
      )}
    </div>
  );
}

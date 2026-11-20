import { notFound, redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";
import { canUseExams } from "@/server/exams/access";
import { getExam } from "@/server/exams/service";
import { examDicts } from "@/lib/i18n/exams";
import { MathText } from "@/components/exams/MathText";
import { PrintButton } from "@/components/exams/PrintButton";

export const metadata = { title: "طباعة الامتحان" };
const LETTERS_AR = ["أ", "ب", "ج", "د", "هـ", "و"];
const LETTERS_EN = ["a", "b", "c", "d", "e", "f"];

/** ورقة الامتحان للطباعة (A4). اللغة من لغة الامتحان لا من لغة الواجهة. ?key=1 للإجابات النموذجية. */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string }> }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!(await canUseExams(auth))) redirect("/exams");
  const exam = await getExam(auth.user.id, (await params).id);
  if (!exam || exam.status !== "READY") notFound();
  const key = (await searchParams).key === "1";
  const en = exam.language === "EN";
  const t = examDicts[en ? "en" : "ar"];
  const num = (n: number) => (en ? String(n) : n.toLocaleString("ar-EG"));
  const letters = en ? LETTERS_EN : LETTERS_AR;
  return (
    <div dir={en ? "ltr" : "rtl"} lang={en ? "en" : "ar"} className="mx-auto max-w-[21cm] bg-white p-8 text-[15px] leading-8 text-black print:p-0">
      <div className="mb-4 flex justify-end print:hidden"><PrintButton label={t.print.doPrint} /></div>
      <header className="grid grid-cols-3 items-start gap-2 border-b-2 border-black pb-3 text-sm leading-6">
        <div><p className="font-semibold">{t.print.republic}</p><p>{t.print.ministry}</p></div>
        <div className="text-center"><p className="text-base font-bold" dir="auto">{exam.title}</p>{key && <p className="font-semibold">{t.print.keyTitle}</p>}</div>
        <div className="text-end">
          <p>{t.print.subject}: {en ? exam.subject.nameEn : exam.subject.nameAr}</p>
          <p>{t.print.grade}: {en ? exam.grade.nameEn : exam.grade.nameAr}</p>
          {exam.durationMinutes ? <p>{t.print.time}: {num(exam.durationMinutes)} {t.print.minutes}</p> : null}
          <p>{t.print.total}: {num(exam.totalMarks)}</p>
        </div>
      </header>
      <div className="mt-4 space-y-5">
        {exam.sections.map((s, i) => (
          <section key={s.id} className="break-inside-avoid-page">
            <h2 className="flex items-baseline justify-between gap-3 font-bold">
              <span>{t.print.q}{num(i + 1)}: {s.instruction ?? s.prompt}</span>
              <span className="shrink-0 text-sm font-normal">({num(s.marks)} {t.marksShort})</span>
            </h2>
            <ol className="mt-1 space-y-2 ps-4">
              {s.branches.map((q, j) => (
                <li key={q.id} className="break-inside-avoid">
                  <div className="flex gap-2"><span className="shrink-0">{en ? `${j + 1}.` : `${num(j + 1)}-`}</span><MathText text={q.prompt} /></div>
                  {!key && Array.isArray(q.options) && (
                    <div className="flex flex-wrap gap-x-8 ps-6">{(q.options as string[]).map((o, k) => <span key={k}>{letters[k]}) <MathText text={o} /></span>)}</div>
                  )}
                  {key && <p className="ps-6 font-semibold"><MathText text={q.answer ?? ""} /></p>}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

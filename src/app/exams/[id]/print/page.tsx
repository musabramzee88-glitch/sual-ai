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

/**
 * ورقة الامتحان للطباعة (A4) بأسلوب الورقة العراقية: «س١/» ثم فروع «١-»، والخيارات «أ-».
 * @page بهامش صفر يمنع المتصفح من طباعة الرابط والتاريخ والعنوان في رأس الورقة وذيلها؛ الهوامش داخل الورقة نفسها.
 * اللغة من لغة الامتحان لا من لغة الواجهة. ?key=1 للإجابات النموذجية.
 */
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
  const q = (i: number) => (en ? `Q${i}/` : `س${num(i)}/`);
  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .sheet { padding: 14mm 15mm !important; box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>
      <div className="mb-4 flex justify-end print:hidden"><PrintButton label={t.print.doPrint} /></div>
      <div dir={en ? "ltr" : "rtl"} lang={en ? "en" : "ar"} className="sheet mx-auto max-w-[21cm] bg-white p-10 text-[15px] leading-8 text-black shadow-sm">
        <header className="grid grid-cols-3 items-start gap-3 text-sm leading-6">
          <div>
            <p className="font-bold">{t.print.republic}</p>
            <p>{t.print.ministry}</p>
            <p>{en ? "Directorate of Education: ............" : "المديرية العامة للتربية: ............"}</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold" dir="auto">{exam.title}</p>
            {key && <p className="mt-1 font-bold">{t.print.keyTitle}</p>}
          </div>
          <div className="text-end">
            <p>{t.print.subject}: {en ? exam.subject.nameEn : exam.subject.nameAr}</p>
            <p>{t.print.grade}: {en ? exam.grade.nameEn : exam.grade.nameAr}</p>
            {exam.durationMinutes ? <p>{t.print.time}: {num(exam.durationMinutes)} {t.print.minutes}</p> : null}
            <p>{t.print.total}: {num(exam.totalMarks)}</p>
          </div>
        </header>
        {!key && (
          <p className="mt-3 flex justify-between gap-4 border-y border-black py-1 text-sm">
            <span>{en ? "Name: ................................................" : "اسم الطالب: ................................................"}</span>
            <span>{en ? "Section: ........" : "الشعبة: ........"}</span>
          </p>
        )}
        <div className={`${key ? "mt-4 border-t-2 border-black pt-3" : "mt-4"} space-y-5`}>
          {exam.sections.map((s, i) => (
            <section key={s.id} className="break-inside-avoid-page">
              <h2 className="flex items-baseline justify-between gap-3 font-bold">
                <span>{q(i + 1)} <MathText text={s.instruction ?? s.prompt} /></span>
                <span className="shrink-0 text-sm">({num(s.marks)} {t.marksShort})</span>
              </h2>
              <ol className="mt-1 space-y-1.5 ps-5">
                {s.branches.map((b, j) => (
                  <li key={b.id} className="break-inside-avoid">
                    <div className="flex gap-2"><span className="shrink-0">{en ? `${j + 1}.` : `${num(j + 1)}-`}</span><MathText text={b.prompt} /></div>
                    {!key && Array.isArray(b.options) && (
                      <div className="flex flex-wrap gap-x-10 ps-6">{(b.options as string[]).map((o, k) => <span key={k}>{letters[k]}- <MathText text={o} /></span>)}</div>
                    )}
                    {key && <p className="ps-6 font-semibold"><MathText text={b.answer ?? ""} /></p>}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        {!key && <p className="mt-8 text-center text-sm font-semibold">{en ? "Good luck" : "مع تمنياتنا لكم بالنجاح والتوفيق"}</p>}
      </div>
    </>
  );
}

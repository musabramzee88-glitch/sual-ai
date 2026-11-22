import { notFound, redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";
import { canUseExams } from "@/server/exams/access";
import { examRenderInput, listTemplates } from "@/server/exams/templates";
import { getLocale } from "@/lib/i18n/server";
import { templateDicts } from "@/lib/i18n/templates";
import { HEADER_KEYS, LABELS, renderExamHtml, type Variant } from "@/lib/exam-render";
import { ExamSheet } from "@/components/exams/ExamSheet";
import { MODEL_LABELS, modelDisplay, type ModelLabel } from "@/lib/exam-models";

export const metadata = { title: "ورقة الامتحان" };
const VARIANTS: Record<string, Variant> = { questions: "QUESTIONS_ONLY", answers: "WITH_ANSWERS", key: "ANSWER_KEY", sheet: "ANSWER_SHEET" };

/**
 * ورقة الامتحان: HTML واحد من renderExamHtml (نفسه في الطباعة وPDF) يُعرض في إطار معزول.
 * ?v=questions|answers|key (و?key=1 للتوافق). الطباعة من الإطار بهامش صفر فلا يطبع المتصفح الرابط والتاريخ.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string; v?: string; m?: string }> }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!(await canUseExams(auth))) redirect("/exams");
  const id = (await params).id;
  const sp = await searchParams;
  const model = (MODEL_LABELS as readonly string[]).includes(sp.m ?? "") ? (sp.m as ModelLabel) : null;
  const input = await examRenderInput(auth.user.id, id, { model });
  if (!input) notFound();
  const v = sp.v && VARIANTS[sp.v] ? sp.v : sp.key === "1" ? "key" : "questions";
  const locale = (await getLocale()) === "en" ? "en" : "ar";
  const html = renderExamHtml(input.renderExam, input.renderTemplate, VARIANTS[v]);
  const templates = (await listTemplates(auth.user.id, locale)).map((t) => ({ id: t.id, name: t.name, preset: t.preset, isDefault: t.isDefault }));
  const lang = input.exam.language === "EN" ? "en" : "ar";
  const sfx = { key: lang === "ar" ? " - الإجابات" : " - key", answers: lang === "ar" ? " - مع الإجابات" : " - with answers", sheet: lang === "ar" ? " - ورقة الإجابة" : " - answer sheet", questions: "" }[v as "key" | "answers" | "sheet" | "questions"];
  const mdl = model ? (lang === "ar" ? ` - نموذج ${modelDisplay(model, "AR")}` : ` - model ${model}`) : "";
  const defaultName = `${input.exam.title}${mdl}${sfx}`;
  return (
    <ExamSheet
      examId={id} defaultName={defaultName} model={model} modelLetters={{ A: modelDisplay("A", input.exam.language), B: modelDisplay("B", input.exam.language), C: modelDisplay("C", input.exam.language), D: modelDisplay("D", input.exam.language) }} html={html} pageSize={input.renderTemplate.pageSize} orientation={input.renderTemplate.orientation} variant={v as "questions" | "answers" | "key" | "sheet"} t={templateDicts[locale]}
      templates={templates} selectedTemplateId={input.selectedTemplateId ?? input.template.id}
      fields={HEADER_KEYS.filter((k) => k !== "student" && k !== "section").map((k) => ({ key: k, label: LABELS[lang][k], placeholder: input.renderExam.values[k] ?? input.renderTemplate.values[k] ?? "" }))}
      values={input.headerValues}
    />
  );
}

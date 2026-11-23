import "server-only";
import JSZip from "jszip";
import { FIT_STEPS, fitProfile, renderExamHtml, type Variant } from "@/lib/exam-render";
import { modelDisplay, type ModelLabel } from "@/lib/exam-models";
import { safeFileName } from "@/lib/file-name";
import { examRenderInput } from "./templates";
import { htmlToPdf } from "./pdf";
import { renderExamDocx } from "./docx";
import { fitInput } from "./fit";

/** تصدير ورقة الامتحان: PDF أو Word، وحزمة ZIP لعدة نماذج ونسخ. كل ملف يُبنى من العارض نفسه فيتطابق المحتوى. */
export type ExportFormat = "pdf" | "docx";
export type VariantKey = "questions" | "answers" | "key" | "sheet";
export const VARIANT: Record<VariantKey, Variant> = { questions: "QUESTIONS_ONLY", answers: "WITH_ANSWERS", key: "ANSWER_KEY", sheet: "ANSWER_SHEET" };
export const MIME = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip: "application/zip" } as const;

export type BuiltFile = { bytes: Buffer; ext: ExportFormat; lang: "ar" | "en"; title: string; ascii: string; suffix: string; examId: string };

/** لاحقة الاسم المفهومة: « - نموذج ب - الإجابات» */
export function nameSuffix(lang: "ar" | "en", variant: VariantKey, model: ModelLabel | null | undefined) {
  const sfx = { key: lang === "ar" ? " - الإجابات" : " - key", answers: lang === "ar" ? " - مع الإجابات" : " - with answers", sheet: lang === "ar" ? " - ورقة الإجابة" : " - answer sheet", questions: "" }[variant];
  const m = model ? (lang === "ar" ? ` - نموذج ${modelDisplay(model, "AR")}` : ` - model ${model}`) : "";
  return `${m}${sfx}`;
}

export async function buildFile(userId: string, examId: string, o: { format: ExportFormat; variant: VariantKey; model?: ModelLabel | null; template?: string | null }): Promise<BuiltFile | null> {
  const input = await examRenderInput(userId, examId, { templateId: o.template, model: o.model ?? null });
  if (!input) return null;
  const lang = input.exam.language === "EN" ? "en" : "ar";
  const variant = VARIANT[o.variant];
  // نسخة الأسئلة تُضبط لتتسع في الحد الأقصى للصفحات (وجه وقفا). Word لا يُقاس فيُصغَّر خطوة إضافية للأمان.
  const fit = await fitInput(input, variant);
  const wordTpl = fit.info && fit.info.step > 0 ? fitProfile({ ...input.renderTemplate, keepSections: fit.info.keep }, Math.min(FIT_STEPS, fit.info.step + 1)) : fit.tpl;
  const bytes = o.format === "docx"
    ? await renderExamDocx(input.renderExam, wordTpl, variant, { pageNumbers: input.template.showPageNumbers })
    : await htmlToPdf(renderExamHtml(input.renderExam, fit.tpl, variant, { forPdf: true }), { pageNumbers: input.template.showPageNumbers, lang });
  const ascii = `exam-${input.exam.id.slice(-6)}${o.model ? `-${o.model}` : ""}${o.variant === "questions" ? "" : `-${o.variant}`}.${o.format}`;
  return { bytes, ext: o.format, lang, title: input.exam.title, ascii, suffix: nameSuffix(lang, o.variant, o.model), examId: input.exam.id };
}

export const fileNameOf = (f: BuiltFile, custom?: string | null) => safeFileName(custom, `${f.title}${f.suffix}`, f.ext);

/** حزمة ZIP: ملف لكل (نموذج × نسخة). الأسماء داخلها واضحة وفريدة، والملفات تُبنى واحداً بعد آخر (محرّك PDF يعمل بدور). */
export async function buildZip(userId: string, examId: string, o: { format: ExportFormat; models: (ModelLabel | null)[]; variants: VariantKey[]; template?: string | null }) {
  const zip = new JSZip();
  const used = new Set<string>();
  let title = "", lang: "ar" | "en" = "ar", count = 0;
  for (const model of o.models) {
    for (const variant of o.variants) {
      const f = await buildFile(userId, examId, { format: o.format, variant, model, template: o.template });
      if (!f) return null;
      title = f.title; lang = f.lang;
      let name = safeFileName(`${f.title}${f.suffix}`, f.title, f.ext);
      for (let i = 2; used.has(name); i++) name = safeFileName(`${f.title}${f.suffix} (${i})`, f.title, f.ext);
      used.add(name);
      zip.file(name, f.bytes);
      count++;
    }
  }
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { bytes, title, lang, count };
}

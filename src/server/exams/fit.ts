import "server-only";
import { createHash } from "node:crypto";
import { FIT_STEPS, fitProfile, renderExamHtml, type RenderExam, type RenderTemplate, type Variant } from "@/lib/exam-render";
import { htmlToPdf } from "./pdf";

/**
 * ملاءمة الورقة لعدد صفحات أقصى (مثلاً صفحتان للطباعة وجهاً وقفا): يقيس عدد الصفحات الحقيقي بمحرّك PDF نفسه ثم يصغّر
 * التنسيق تدريجياً (`fitProfile`). الترتيب: أولاً مع إبقاء كل سؤال في صفحة واحدة، فإن لم يتسع يُسمح بتقسيم الأسئلة
 * الطويلة، فإن لم يتسع حتى بأصغر تنسيق يُبلَّغ المدرس (fits=false) ليقلّل الأسئلة. النتيجة تُخزَّن مؤقتاً.
 */
export type FitInfo = { max: number; pages: number | null; fits: boolean; step: number; keep: boolean; adjusted: boolean };
export type FitResult = { tpl: RenderTemplate; info: FitInfo };

/** عدد صفحات ملف PDF (عدد كائنات /Type /Page) */
export const countPdfPages = (pdf: Buffer): number => (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

const cache = new Map<string, FitResult>();
const MAX_CACHE = 60;

export async function fitToPages(exam: RenderExam, tpl: RenderTemplate, variant: Variant, max: number): Promise<FitResult> {
  const key = createHash("sha1").update(JSON.stringify([exam, tpl, variant, max])).digest("hex");
  const hit = cache.get(key);
  if (hit) return hit;

  const pagesOf = async (k: number, keep: boolean) => countPdfPages(await htmlToPdf(renderExamHtml(exam, fitProfile({ ...tpl, keepSections: keep }, k), variant, { forPdf: true }), { pageNumbers: false, lang: exam.lang === "EN" ? "en" : "ar" }));
  const done = (k: number, keep: boolean, pages: number, fits: boolean): FitResult => ({ tpl: k === 0 && keep ? tpl : fitProfile({ ...tpl, keepSections: keep }, k), info: { max, pages, fits, step: k, keep, adjusted: k > 0 || !keep } });
  /** أصغر خطوة تتسع (الصفحات تتناقص مع الخطوة) بين 1 وآخر خطوة، أو null */
  const search = async (keep: boolean, lastPages: number): Promise<{ k: number; pages: number } | null> => {
    if (lastPages > max) return null;
    let lo = 1, hi = FIT_STEPS, best = { k: FIT_STEPS, pages: lastPages };
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const p = await pagesOf(mid, keep);
      if (p <= max) { best = { k: mid, pages: p }; hi = mid; } else lo = mid + 1;
    }
    return best;
  };

  let result: FitResult;
  const p0 = await pagesOf(0, true);
  if (p0 <= max) result = done(0, true, p0, true);
  else {
    const lastKeep = await pagesOf(FIT_STEPS, true);
    const a = await search(true, lastKeep);
    if (a) result = done(a.k, true, a.pages, true);
    else {
      const lastSplit = await pagesOf(FIT_STEPS, false);
      const b = await search(false, lastSplit);
      result = b ? done(b.k, false, b.pages, true) : done(FIT_STEPS, false, lastSplit, false);
    }
  }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}

/** يطبّق حد الصفحات على نسخة الأسئلة فقط (الإجابات وورقة الإجابة بلا حد). فشل القياس (لا متصفح) لا يمنع العرض: تبقى الورقة كما هي. */
export async function fitInput(input: { renderExam: RenderExam; renderTemplate: RenderTemplate; template: { maxPages?: number } }, variant: Variant): Promise<{ tpl: RenderTemplate; info: FitInfo | null }> {
  const max = input.template.maxPages ?? 2;
  if (variant !== "QUESTIONS_ONLY" || max <= 0) return { tpl: input.renderTemplate, info: null };
  try {
    const r = await fitToPages(input.renderExam, input.renderTemplate, variant, max);
    return { tpl: r.tpl, info: r.info };
  } catch (e) {
    console.error(`[fit] skipped: ${(e as Error).message.split("\n")[0]}`);
    return { tpl: input.renderTemplate, info: null };
  }
}

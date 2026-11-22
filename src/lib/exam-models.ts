/**
 * نماذج الامتحان A/B/C/D (دوال نقية): النموذج A هو الأصل، وكل نموذج آخر مشتق منه بخلط ثابت (بذرة = معرّف الامتحان + الحرف)
 * فلا تُخزَّن نسخ: أي تعديل على الأسئلة ينعكس على كل النماذج، والنموذج نفسه يخرج دائماً بالترتيب نفسه.
 * يُخلَط ترتيب الفروع داخل كل سؤال رئيس وترتيب خيارات الاختيار من متعدد؛ ترتيب الأسئلة الرئيسة وتعليماتها ثابت
 * (والسؤال الأول الإجباري يبقى أولاً). الدرجات لا تتغير، والجواب يبقى نص الخيار الصحيح فيبقى مفتاح كل نموذج صحيحاً.
 */
import type { RenderExam, RenderQuestion } from "./exam-render";

export const MODEL_LABELS = ["A", "B", "C", "D"] as const;
export type ModelLabel = (typeof MODEL_LABELS)[number];
/** حرف العرض: عربي (أ ب ج د) للامتحان العربي */
export const modelDisplay = (label: ModelLabel, lang: "AR" | "EN") => (lang === "EN" ? label : ({ A: "أ", B: "ب", C: "ج", D: "د" } as const)[label]);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** mulberry32 */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** خيارات «كل ما سبق/لا شيء مما سبق» تبقى في مكانها الأخير لأن معناها يتعلق بموضعها */
const POSITIONAL = /(?:جميع|كل|كلا|لا\s*شيء|ليس\s*أيّ?)\s*(?:ما\s*)?(?:ذكر|سبق|مما)|all of the above|none of the above|both\b/i;

export function shuffleOptions(options: string[], rand: () => number): string[] {
  const fixed = options.filter((o) => POSITIONAL.test(o));
  const free = options.filter((o) => !POSITIONAL.test(o));
  return [...shuffled(free, rand), ...fixed];
}

const signature = (e: RenderExam) => e.sections.map((s) => s.branches.map((b) => `${b.prompt}|${(b.options ?? []).join(",")}`).join(";")).join("#");

function derive(exam: RenderExam, seed: string): RenderExam {
  const rand = rng(hash(seed));
  return {
    ...exam,
    sections: exam.sections.map((s) => ({
      ...s,
      branches: shuffled(s.branches, rand).map((b): RenderQuestion => (b.options && b.options.length > 1 ? { ...b, options: shuffleOptions(b.options, rand) } : b)),
    })),
  };
}

/**
 * يعيد النموذج المطلوب. A = الأصل كما هو. B/C/D مشتقة، وتُجرَّب بذور متتالية حتى يختلف ترتيب النموذج
 * عن الأصل وعن النماذج السابقة له (حين يتسع عدد الفروع لذلك).
 */
export function modelOf(exam: RenderExam, label: ModelLabel, examId: string): RenderExam {
  const idx = MODEL_LABELS.indexOf(label);
  if (idx <= 0) return exam;
  const taken = new Set<string>([signature(exam)]);
  let out = exam;
  for (let k = 1; k <= idx; k++) {
    let best = exam;
    for (let attempt = 0; attempt < 12; attempt++) {
      best = derive(exam, `${examId}:${MODEL_LABELS[k]}:${attempt}`);
      if (!taken.has(signature(best))) break;
    }
    taken.add(signature(best));
    out = best;
  }
  return out;
}

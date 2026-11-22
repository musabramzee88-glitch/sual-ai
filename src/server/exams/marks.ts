/**
 * توزيع الدرجات (دوال نقية):
 * - smart: وزن كل فرع = جهد نوعه (TYPE_WEIGHT) × صعوبته؛ القسم يأخذ نصيبه من المجموع.
 * - equal: الأقسام متساوية (أسلوب «لكل سؤال كذا درجة»).
 * ثم: درجات الأقسام أعداد صحيحة مجموعها = المجموع بالضبط (أكبر باقٍ)، وتُقرَّب لمضاعفات 5 حين يسمح المجموع
 * (أسلوب الورقة العراقية: ٢٠، ١٥…)؛ وداخل القسم فروع متساوية (أنصاف عند الحاجة، وإلا +1 للأصعب).
 */
import { TYPE_WEIGHT, type QType } from "@/lib/question-types";

export type MarkItem = { id: string; difficulty: "EASY" | "MEDIUM" | "HARD" | null };
/** answerCount: عدد الفروع التي يجيب عنها الطالب (null = كلها) */
export type MarkSection = { id: string; type: QType; items: MarkItem[]; answerCount?: number | null };
/** على مستوى الامتحان: عدد الأسئلة الرئيسة التي يجيب عنها الطالب (null = كلها) والأول إجباري */
export type Counting = { sectionsToAnswer: number | null; firstRequired: boolean };
export type MarkPlan = { sections: { id: string; marks: number; items: { id: string; marks: number }[] }[]; total: number };

const FACTOR = { EASY: 0.8, MEDIUM: 1, HARD: 1.3 } as const;
const factor = (d: MarkItem["difficulty"]) => (d ? FACTOR[d] : 1);

/** يقسم total على أوزان إلى أعداد صحيحة (مضاعفات unit) مجموعها total، وكل جزء ≥ minEach[i] */
function apportion(weights: number[], total: number, unit: number, minEach: number[]): number[] {
  const units = Math.round(total / unit);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const minU = minEach.map((m) => Math.ceil(m / unit));
  const exact = weights.map((w) => (w / sum) * units);
  const base = exact.map((x, i) => Math.max(minU[i], Math.floor(x)));
  let left = units - base.reduce((a, b) => a + b, 0);
  // باقي الوحدات للأكبر كسراً، وإن تجاوز الحد الأدنى المجموعَ يُنقص من الأكبر
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  for (let k = 0; left > 0; k++) { base[order[k % order.length]]++; left--; }
  while (left < 0) {
    const i = base.map((b, j) => [b - minU[j], j] as const).filter(([room]) => room > 0).sort((a, b) => base[b[1]] - base[a[1]])[0]?.[1];
    if (i === undefined) break;
    base[i]--; left++;
  }
  return base.map((u) => u * unit);
}

/** داخل القسم: فروع متساوية؛ أنصاف إن لم تقبل القسمة، وإلا +1 للأصعب */
function splitSection(marks: number, items: MarkItem[]): number[] {
  const n = items.length;
  if (n === 0) return [];
  const each = marks / n;
  if (Number.isInteger(each * 2)) return items.map(() => each);
  const floor = Math.floor(each);
  let extra = marks - floor * n;
  const order = items.map((it, i) => [factor(it.difficulty), i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const out = items.map(() => floor);
  for (const i of order) { if (extra <= 0) break; out[i]++; extra--; }
  return out;
}

const half = (x: number) => Math.round(x * 2) / 2;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** عدد الفروع التي يجاب عنها فعلاً (answerCount صالح أصغر من العدد، وإلا الكل) */
export const effectiveCount = (n: number, answerCount?: number | null) => (answerCount && answerCount >= 1 && answerCount < n ? answerCount : n);

/** درجة القسم الفعلية: مجموع أكبر k فرع (أعلى ما يمكن للطالب تحصيله حين يجيب عن k فقط) */
export function sectionMarks(branchMarks: number[], answerCount?: number | null): number {
  const k = effectiveCount(branchMarks.length, answerCount);
  return half(sum([...branchMarks].sort((a, b) => b - a).slice(0, k)));
}

/** عدد الأسئلة الرئيسة التي يجاب عنها فعلاً */
export const effectiveSections = (n: number, c: Counting) => (c.sectionsToAnswer && c.sectionsToAnswer >= 1 && c.sectionsToAnswer < n ? c.sectionsToAnswer : n);

/**
 * الدرجة الكلية الفعلية: الأقسام الإلزامية كاملة (الأول إن كان إجبارياً) + أكبر ما يكفي من الباقي
 * ليبلغ عدد الأسئلة المجاب عنها ما حدّده المدرس.
 */
export function examTotal(sectionTotals: number[], c: Counting): number {
  const n = sectionTotals.length;
  const take = effectiveSections(n, c);
  if (take >= n) return sum(sectionTotals);
  const required = c.firstRequired ? [sectionTotals[0]] : [];
  const rest = (c.firstRequired ? sectionTotals.slice(1) : sectionTotals).sort((a, b) => b - a).slice(0, take - required.length);
  return half(sum([...required, ...rest]));
}

/** أقل مجموع ممكن: نصف درجة لكل فرع يُجاب عنه */
export const minTotal = (sections: MarkSection[], c: Counting = { sectionsToAnswer: null, firstRequired: true }) => {
  const live = sections.filter((s) => s.items.length > 0);
  const per = live.map((s) => Math.ceil(effectiveCount(s.items.length, s.answerCount) / 2));
  if (live.length === 0) return 0;
  const take = effectiveSections(live.length, c);
  return take >= live.length ? sum(per) : take * Math.max(...per);
};

export function distributeMarks(
  sections: MarkSection[], total: number, mode: "smart" | "equal", c: Counting = { sectionsToAnswer: null, firstRequired: true },
): MarkPlan | { error: "TOTAL_TOO_SMALL"; min: number } {
  const live = sections.filter((s) => s.items.length > 0);
  if (minTotal(live, c) > total) return { error: "TOTAL_TOO_SMALL", min: minTotal(live, c) };
  const take = effectiveSections(live.length, c);
  // فرع اختياري: الفروع كلها بدرجة واحدة (مجموع k منها = درجة القسم) لأن الطالب يختار أيها شاء
  const branches = (s: MarkSection, marks: number): number[] => {
    const k = effectiveCount(s.items.length, s.answerCount);
    if (k === s.items.length) return splitSection(marks, s.items);
    return s.items.map(() => Math.max(0.5, half(marks / k)));
  };
  let secMarks: number[];
  if (take < live.length) {
    // أسئلة رئيسة اختيارية: متساوية (أسلوب «لكل سؤال كذا درجة»)، والمجموع = ما يُجاب عنه فقط
    secMarks = live.map(() => Math.max(0.5, half(total / take)));
  } else {
    const weights = live.map((s) => (mode === "equal" ? 1 : s.items.reduce((n, it) => n + (TYPE_WEIGHT[s.type] ?? 2) * factor(it.difficulty), 0)));
    // مضاعفات 5 حين يتسع المجموع لها (كل قسم ≥ 5 ويحتمل فروعه)، وإلا أعداد صحيحة
    const unit = total % 5 === 0 && total / 5 >= live.length && live.every((s) => effectiveCount(s.items.length, s.answerCount) <= total / live.length) ? 5 : 1;
    const minEach = live.map((s) => Math.max(unit, Math.ceil(effectiveCount(s.items.length, s.answerCount) / 2)));
    secMarks = apportion(weights, total, unit, minEach);
  }
  const plan = live.map((s, i) => {
    const per = branches(s, secMarks[i]);
    return { id: s.id, marks: sectionMarks(per, s.answerCount), items: s.items.map((it, j) => ({ id: it.id, marks: per[j] })) };
  });
  // المجموع الفعلي (قد يخالف المطلوب بنصف درجة حين لا تقبل القسمة على عدد الفروع المجاب عنها)
  return { sections: plan, total: examTotal(plan.map((s) => s.marks), c) };
}

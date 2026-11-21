/**
 * توزيع الدرجات (دوال نقية):
 * - smart: وزن كل فرع = جهد نوعه (TYPE_WEIGHT) × صعوبته؛ القسم يأخذ نصيبه من المجموع.
 * - equal: الأقسام متساوية (أسلوب «لكل سؤال كذا درجة»).
 * ثم: درجات الأقسام أعداد صحيحة مجموعها = المجموع بالضبط (أكبر باقٍ)، وتُقرَّب لمضاعفات 5 حين يسمح المجموع
 * (أسلوب الورقة العراقية: ٢٠، ١٥…)؛ وداخل القسم فروع متساوية (أنصاف عند الحاجة، وإلا +1 للأصعب).
 */
import { TYPE_WEIGHT, type QType } from "@/lib/question-types";

export type MarkItem = { id: string; difficulty: "EASY" | "MEDIUM" | "HARD" | null };
export type MarkSection = { id: string; type: QType; items: MarkItem[] };
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

/** أقل مجموع ممكن: نصف درجة لكل فرع على الأقل */
export const minTotal = (sections: MarkSection[]) => sections.filter((s) => s.items.length > 0).reduce((n, s) => n + Math.ceil(s.items.length / 2), 0);

export function distributeMarks(sections: MarkSection[], total: number, mode: "smart" | "equal"): MarkPlan | { error: "TOTAL_TOO_SMALL"; min: number } {
  const live = sections.filter((s) => s.items.length > 0);
  if (minTotal(live) > total) return { error: "TOTAL_TOO_SMALL", min: minTotal(live) };
  const weights = live.map((s) => (mode === "equal" ? 1 : s.items.reduce((n, it) => n + (TYPE_WEIGHT[s.type] ?? 2) * factor(it.difficulty), 0)));
  // مضاعفات 5 حين يتسع المجموع لها (كل قسم ≥ 5 ويحتمل فروعه)، وإلا أعداد صحيحة
  const unit = total % 5 === 0 && total / 5 >= live.length && live.every((s) => s.items.length <= total / live.length) ? 5 : 1;
  const minEach = live.map((s) => Math.max(unit, Math.ceil(s.items.length / 2)));
  const secMarks = apportion(weights, total, unit, minEach);
  const plan = live.map((s, i) => {
    const per = splitSection(secMarks[i], s.items);
    return { id: s.id, marks: secMarks[i], items: s.items.map((it, j) => ({ id: it.id, marks: per[j] })) };
  });
  return { sections: plan, total: plan.reduce((n, s) => n + s.marks, 0) };
}

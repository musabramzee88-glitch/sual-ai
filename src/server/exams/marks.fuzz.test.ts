import { describe, expect, it } from "vitest";
import { distributeMarks, minTotal, type MarkSection } from "./marks";

/** فحص عشوائي واسع لثوابت توزيع الدرجات (بذرة ثابتة فالنتيجة قابلة للتكرار) */
function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); }
const TYPES = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "MATCHING", "DEFINE", "JUSTIFY", "COMPARE", "ESSAY"] as const;
const DIFF = ["EASY", "MEDIUM", "HARD", null] as const;

describe("distributeMarks — ثوابت على مدخلات عشوائية", () => {
  it("بلا أسئلة اختيارية: المجموع مضبوط، والفروع أنصاف موجبة، ومجموع الفروع = درجة القسم", () => {
    const r = rng(7);
    const fails: string[] = [];
    for (let t = 0; t < 4000; t++) {
      const nSec = 1 + Math.floor(r() * 8);
      const sections: MarkSection[] = Array.from({ length: nSec }, (_, i) => ({
        id: `s${i}`, type: TYPES[Math.floor(r() * TYPES.length)] as MarkSection["type"],
        items: Array.from({ length: 1 + Math.floor(r() * 10) }, (_, j) => ({ id: `s${i}q${j}`, difficulty: DIFF[Math.floor(r() * 4)] })),
      }));
      const min = minTotal(sections);
      const total = min + Math.floor(r() * 120);
      for (const mode of ["smart", "equal"] as const) {
        const p = distributeMarks(sections, total, mode);
        if ("error" in p) { fails.push(`error total=${total} min=${min}`); continue; }
        if (p.total !== total) fails.push(`total ${p.total} != ${total}`);
        for (const s of p.sections) {
          const sumItems = s.items.reduce((a, b) => a + b.marks, 0);
          if (Math.abs(sumItems - s.marks) > 1e-9) fails.push(`section sum ${sumItems} != ${s.marks}`);
          for (const it of s.items) if (!(it.marks >= 0.5) || !Number.isInteger(it.marks * 2)) fails.push(`item ${it.marks} (sec ${s.marks}/${s.items.length}, total ${total}, min ${min})`);
        }
      }
    }
    expect([...new Set(fails)].slice(0, 10)).toEqual([]);
  });

  it("أقل من الحد الأدنى يُرفض دائماً", () => {
    const s: MarkSection[] = [{ id: "a", type: "MCQ", items: Array.from({ length: 9 }, (_, j) => ({ id: `q${j}`, difficulty: null })) }];
    expect(distributeMarks(s, minTotal(s) - 1, "smart")).toMatchObject({ error: "TOTAL_TOO_SMALL" });
  });
});

describe("distributeMarks — أسئلة وفروع اختيارية", () => {
  it("كل فرع نصف درجة على الأقل، والمجموع الفعلي قريب من المطلوب (فرق تقريب صغير فقط)", () => {
    const r = rng(11);
    const fails: string[] = [];
    for (let t = 0; t < 3000; t++) {
      const nSec = 2 + Math.floor(r() * 7);
      const sections: MarkSection[] = Array.from({ length: nSec }, (_, i) => {
        const n = 1 + Math.floor(r() * 9);
        return { id: `s${i}`, type: TYPES[Math.floor(r() * TYPES.length)] as MarkSection["type"], answerCount: r() < 0.4 && n > 1 ? 1 + Math.floor(r() * (n - 1)) : null, items: Array.from({ length: n }, (_, j) => ({ id: `s${i}q${j}`, difficulty: DIFF[Math.floor(r() * 4)] })) };
      });
      const c = { sectionsToAnswer: r() < 0.5 ? 1 + Math.floor(r() * (nSec - 1)) : null, firstRequired: r() < 0.7 };
      const total = minTotal(sections, c) + Math.floor(r() * 100);
      const p = distributeMarks(sections, total, "smart", c);
      if ("error" in p) { fails.push(`error ${total}`); continue; }
      const optBranches = sections.some((s) => s.answerCount);
      const take = c.sectionsToAnswer ?? nSec;
      // بلا فروع اختيارية: الفرق تقريب «المجموع ÷ عدد المجاب عنه» لأقرب نصف فقط؛ مع فروع اختيارية لا تقبل القسمة يُسمح بأكثر
      const tol = optBranches ? Math.max(3, total * 0.12) : take * 0.25 + 1e-9;
      if (Math.abs(p.total - total) > tol) fails.push(`total ${p.total} vs ${total} (opt=${optBranches})`);
      for (const s of p.sections) for (const it of s.items) if (!(it.marks >= 0.5) || !Number.isInteger(it.marks * 2)) fails.push(`item ${it.marks}`);
    }
    expect([...new Set(fails)].slice(0, 10)).toEqual([]);
  });
});

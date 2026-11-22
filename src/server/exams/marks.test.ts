import { describe, expect, it } from "vitest";
import { distributeMarks, type MarkSection } from "./marks";

const sec = (id: string, type: MarkSection["type"], n: number, d: "EASY" | "MEDIUM" | "HARD" | null = null): MarkSection => ({ id, type, items: Array.from({ length: n }, (_, i) => ({ id: `${id}${i}`, difficulty: d })) });
const ok = (p: ReturnType<typeof distributeMarks>) => { if ("error" in p) throw new Error(p.error); return p; };
const sum = (p: ReturnType<typeof distributeMarks>) => ok(p).sections.reduce((n, s) => n + s.items.reduce((m, it) => m + it.marks, 0), 0);

describe("marks distribution", () => {
  it("smart: longer-answer types get more, totals are exact, sections are multiples of 5 when the total allows", () => {
    const p = ok(distributeMarks([sec("a", "MCQ", 10), sec("b", "DEFINE", 5), sec("c", "WRITE_VERSE", 2), sec("d", "ESSAY", 2)], 100, "smart"));
    expect(p.total).toBe(100);
    expect(sum(p)).toBe(100);
    for (const s of p.sections) expect(s.marks % 5).toBe(0);
    const per = Object.fromEntries(p.sections.map((s) => [s.id, s.items[0].marks]));
    expect(per.d).toBeGreaterThan(per.a); // سؤال مقالي أثقل من سؤال اختيار
    expect(per.c).toBeGreaterThan(per.b);
  });
  it("equal: every section gets the same share; items inside a section are equal (halves allowed)", () => {
    const p = ok(distributeMarks([sec("a", "MCQ", 4), sec("b", "DEFINE", 3), sec("c", "ESSAY", 2), sec("d", "JUSTIFY", 5), sec("e", "LIST", 2)], 100, "equal"));
    expect(p.sections.map((s) => s.marks)).toEqual([20, 20, 20, 20, 20]);
    expect(p.sections[1].items.map((i) => i.marks)).toEqual([7, 7, 6]); // 20/3: لا أنصاف ⇒ +1 لاثنين
    expect(p.sections[0].items.map((i) => i.marks)).toEqual([5, 5, 5, 5]);
    expect(sum(p)).toBe(100);
  });
  it("small totals use whole marks; harder items get the extra mark", () => {
    const p = ok(distributeMarks([{ id: "a", type: "DEFINE", items: [{ id: "x", difficulty: "EASY" }, { id: "y", difficulty: "HARD" }, { id: "z", difficulty: "MEDIUM" }] }, sec("b", "MCQ", 3)], 13, "smart"));
    expect(p.total).toBe(13);
    expect(sum(p)).toBe(13);
    const a = p.sections[0].items;
    expect(a.find((i) => i.id === "y")!.marks).toBeGreaterThanOrEqual(a.find((i) => i.id === "x")!.marks);
  });
  it("refuses a total too small for half a mark per item", () => {
    expect(distributeMarks([sec("a", "MCQ", 20), sec("c", "DEFINE", 1)], 10, "smart")).toEqual({ error: "TOTAL_TOO_SMALL", min: 11 });
  });
  it("ignores empty sections and never gives a section zero", () => {
    const p = ok(distributeMarks([sec("a", "MCQ", 8), sec("b", "ESSAY", 0), sec("c", "DEFINE", 1)], 10, "smart"));
    expect(p.sections.map((s) => s.id)).toEqual(["a", "c"]);
    expect(p.sections.every((s) => s.marks > 0)).toBe(true);
    expect(sum(p)).toBe(10);
  });
});

describe("optional questions (the student may leave some)", async () => {
  const { sectionMarks, examTotal, effectiveCount } = await import("./marks");
  const sec = (id: string, n: number, answerCount: number | null = null): MarkSection => ({ id, type: "DEFINE", answerCount, items: Array.from({ length: n }, (_, i) => ({ id: `${id}${i}`, difficulty: null })) });

  it("a section's marks count only the branches the student answers", () => {
    expect(sectionMarks([5, 5, 5, 5], 3)).toBe(15);
    expect(sectionMarks([2, 4, 6], 2)).toBe(10); // أعلى ما يمكن تحصيله
    expect(sectionMarks([5, 5], null)).toBe(10);
    expect(sectionMarks([5, 5], 5)).toBe(10); // أكبر من العدد = الكل
    expect(effectiveCount(4, 0)).toBe(4);
  });
  it("the exam total counts the compulsory first question plus the best of the rest", () => {
    // ٦ أسئلة بـ٢٠ يجيب عن ٥ والأول إجباري = ١٠٠
    expect(examTotal([20, 20, 20, 20, 20, 20], { sectionsToAnswer: 5, firstRequired: true })).toBe(100);
    expect(examTotal([10, 20, 30, 40], { sectionsToAnswer: 2, firstRequired: true })).toBe(50); // 10 + أكبر واحد (40)
    expect(examTotal([10, 20, 30, 40], { sectionsToAnswer: 2, firstRequired: false })).toBe(70);
    expect(examTotal([10, 20], { sectionsToAnswer: null, firstRequired: true })).toBe(30);
    expect(examTotal([10, 20], { sectionsToAnswer: 5, firstRequired: true })).toBe(30); // أكبر من العدد = الكل
  });
  it("distribution: 6 equal questions, answer 5 of them, total 100 → 20 each, exam total exactly 100", () => {
    const p = ok(distributeMarks(Array.from({ length: 6 }, (_, i) => sec(`s${i}`, 3)), 100, "smart", { sectionsToAnswer: 5, firstRequired: true }));
    expect(p.sections.map((s) => s.marks)).toEqual([20, 20, 20, 20, 20, 20]);
    expect(p.total).toBe(100);
  });
  it("distribution: answer 3 of 5 branches inside a section → each branch carries section/3", () => {
    const p = ok(distributeMarks([sec("a", 5, 3), sec("b", 2)], 30, "equal"));
    const a = p.sections[0];
    expect(a.items.map((i) => i.marks)).toEqual([a.marks / 3, a.marks / 3, a.marks / 3, a.marks / 3, a.marks / 3]);
    expect(p.total).toBe(p.sections[0].marks + p.sections[1].marks);
    expect(Math.abs(p.total - 30)).toBeLessThanOrEqual(1.5);
  });
  it("the minimum total only counts what is answered", () => {
    expect("error" in distributeMarks([sec("a", 10, 2), sec("b", 10, 2)], 2, "equal")).toBe(false); // 2 + 2 فروع = ٢ درجة (نصف لكل)
    expect("error" in distributeMarks(Array.from({ length: 4 }, (_, i) => sec(`s${i}`, 6)), 1, "equal", { sectionsToAnswer: 2, firstRequired: true })).toBe(true);
  });
});

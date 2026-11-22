import { describe, expect, it } from "vitest";
import { modelDisplay, modelOf, shuffleOptions } from "./exam-models";
import type { RenderExam } from "./exam-render";

const mcq = (i: number) => ({ prompt: `سؤال ${i}`, options: ["أول", "ثاني", "ثالث", "رابع"], answer: "ثالث", marks: 2 });
const exam: RenderExam = {
  lang: "AR", values: {},
  sections: [
    { instruction: "اختر:", marks: 20, branches: Array.from({ length: 10 }, (_, i) => mcq(i + 1)) },
    { instruction: "عرّف:", marks: 10, branches: ["الخلية", "النسيج", "العضو", "الجهاز"].map((p) => ({ prompt: p, options: null, answer: `تعريف ${p}`, marks: 2.5 })) },
  ],
};
const flat = (e: RenderExam) => e.sections.flatMap((s) => s.branches);

describe("exam models A/B/C/D", () => {
  it("A is the original untouched; the same label always gives the same model", () => {
    expect(modelOf(exam, "A", "ex1")).toBe(exam);
    expect(JSON.stringify(modelOf(exam, "B", "ex1"))).toBe(JSON.stringify(modelOf(exam, "B", "ex1")));
    expect(JSON.stringify(modelOf(exam, "B", "ex1"))).not.toBe(JSON.stringify(modelOf(exam, "B", "ex2"))); // امتحان آخر = خلط آخر
  });
  it("B, C and D differ from the original and from each other", () => {
    const sigs = (["A", "B", "C", "D"] as const).map((l) => JSON.stringify(modelOf(exam, l, "ex1").sections.map((s) => s.branches.map((b) => `${b.prompt}${b.options}`))));
    expect(new Set(sigs).size).toBe(4);
  });
  it("keeps every question, its marks, the section order and instructions, and totals", () => {
    for (const l of ["B", "C", "D"] as const) {
      const m = modelOf(exam, l, "ex1");
      expect(m.sections.map((s) => s.instruction)).toEqual(["اختر:", "عرّف:"]);
      expect(m.sections.map((s) => s.marks)).toEqual([20, 10]);
      expect(flat(m).map((b) => b.prompt).sort()).toEqual(flat(exam).map((b) => b.prompt).sort());
      expect(flat(m).reduce((n, b) => n + b.marks, 0)).toBe(flat(exam).reduce((n, b) => n + b.marks, 0));
      // كل فرع يبقى بدرجته وإجابته
      for (const b of flat(m)) {
        const orig = flat(exam).find((x) => x.prompt === b.prompt)!;
        expect([b.marks, b.answer]).toEqual([orig.marks, orig.answer]);
      }
    }
  });
  it("the answer of each choice question is still one of its (shuffled) options, so every model's key is correct", () => {
    for (const l of ["B", "C", "D"] as const) {
      for (const b of flat(modelOf(exam, l, "ex1")).filter((x) => x.options)) {
        expect(b.options).toHaveLength(4);
        expect([...b.options!].sort()).toEqual(["أول", "ثاني", "ثالث", "رابع"].sort());
        expect(b.options).toContain(b.answer);
      }
    }
  });
  it("«all of the above» style options stay last", () => {
    const rand = (() => { let i = 0; return () => ((i += 0.37) % 1); })();
    for (let k = 0; k < 20; k++) expect(shuffleOptions(["أ", "ب", "جميع ما سبق", "ج"], rand)[3]).toBe("جميع ما سبق");
    expect(shuffleOptions(["a", "b", "All of the above"], rand)[2]).toBe("All of the above");
  });
  it("a section with a single branch can't be shuffled but nothing breaks; letters display per language", () => {
    const one: RenderExam = { lang: "AR", values: {}, sections: [{ instruction: "x", marks: 1, branches: [{ prompt: "ا", options: null, answer: "", marks: 1 }] }] };
    expect(modelOf(one, "D", "e").sections[0].branches).toHaveLength(1);
    expect(modelDisplay("B", "AR")).toBe("ب");
    expect(modelDisplay("B", "EN")).toBe("B");
  });
});

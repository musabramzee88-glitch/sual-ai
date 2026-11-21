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

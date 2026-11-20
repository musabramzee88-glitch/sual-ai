import { describe, expect, it } from "vitest";
import { parseTocEntries, proposeChapters } from "./toc";

const pages = (n: number, set: Record<number, string>) => Array.from({ length: n }, (_, i) => ({ pageNumber: i + 1, text: set[i + 1] ?? `نص عادي للصفحة ${i + 1} حول الدرس والتمرين` }));

describe("TOC parsing", () => {
  const toc = "المحتويات\nالفصل الأول: الأعداد الطبيعية ........ 5\nالفصل الثاني: الكسور ........ 20\nالفصل الثالث: الهندسة ........ ٣٥\nالدرس الأول 6";
  it("prefers top-level chapters over lessons and reads Arabic-Indic digits", () => {
    const e = parseTocEntries([toc], 60);
    expect(e.map((x) => x.printed)).toEqual([5, 20, 35]);
    expect(e[0].title).toContain("الأعداد الطبيعية");
  });
  it("falls back to number-first lines", () => {
    const e = parseTocEntries(["فهرس\n5 .... الجمع والطرح\n12 .... الضرب\n25 .... القسمة"], 60);
    expect(e.map((x) => x.printed)).toEqual([5, 12, 25]);
  });
  it("proposes chapters with the printed→file offset verified from the titles", () => {
    const p = pages(60, {
      3: toc,
      9: "الفصل الأول الأعداد الطبيعية تمهيد", // printed 5 + offset 4
      24: "الفصل الثاني الكسور تمهيد",
      39: "الفصل الثالث الهندسة تمهيد",
    });
    const r = proposeChapters(p, 60)!;
    expect(r.offset).toBe(4);
    expect(r.chapters.map((c) => [c.pageStart, c.pageEnd])).toEqual([[9, 23], [24, 38], [39, 60]]);
  });
  it("refuses to guess when titles cannot be located", () => {
    expect(proposeChapters(pages(60, { 3: toc }), 60)).toBeNull();
    expect(proposeChapters(pages(60, {}), 60)).toBeNull();
  });
});

describe("TOC guards", () => {
  it("returns nothing for a long lesson-level contents list (no chapter level)", () => {
    const lines = ["المحتويات", ...Array.from({ length: 40 }, (_, i) => `موضوع رقم ${i + 1} ........ ${i + 3}`)].join("\n");
    expect(parseTocEntries([lines], 100)).toEqual([]);
  });
  it("drops 'introduction' and leading numbering from titles", () => {
    const e = parseTocEntries(["المحتويات\nالمقدمة ........ 3\n5 .... الفصل الأول: الحركة ........ 5\nالفصل الثاني: القوة ........ 15"], 60);
    expect(e.map((x) => x.title)).toEqual(["الفصل الأول: الحركة", "الفصل الثاني: القوة"]);
  });
});

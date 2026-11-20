import { describe, expect, it } from "vitest";
import { buildPrompt, cleanQuestion, createExamSchema, expandRanges, pickImagePages, sortIntoSections } from "./core";

const pages = new Set([10, 11, 12]);

describe("exam input", () => {
  it("requires chapters or a page range, caps questions, refuses duplicate sections", () => {
    const base = { curriculumId: "c".repeat(20), sections: [{ type: "MCQ", count: 5, marksEach: 2 }] };
    expect(createExamSchema.safeParse(base).success).toBe(false);
    expect(createExamSchema.safeParse({ ...base, pageFrom: 10, pageTo: 20 }).success).toBe(true);
    expect(createExamSchema.safeParse({ ...base, chapterIds: ["x".repeat(20)] }).success).toBe(true);
    expect(createExamSchema.safeParse({ ...base, pageFrom: 10, pageTo: 5 }).success).toBe(false);
    expect(createExamSchema.safeParse({ ...base, pageFrom: 1, pageTo: 2, sections: [{ type: "MCQ", count: 20, marksEach: 1 }, { type: "ESSAY", count: 20, marksEach: 1 }, { type: "DEFINE", count: 1, marksEach: 1 }] }).success).toBe(false);
    expect(createExamSchema.safeParse({ ...base, pageFrom: 1, pageTo: 2, sections: [{ type: "MCQ", count: 2, marksEach: 1 }, { type: "MCQ", count: 2, marksEach: 1 }] }).success).toBe(false);
  });
});

describe("question cleaning", () => {
  it("MCQ: answer must be one of the options (verbatim, by letter, or normalized)", () => {
    expect(cleanQuestion({ prompt: "عاصمة العراق", options: ["بغداد", "البصرة", "أربيل", "الموصل"], answer: "بغداد", sourcePages: [10] }, "MCQ", pages, "AR")?.answer).toBe("بغداد");
    expect(cleanQuestion({ prompt: "عاصمة العراق", options: ["بغداد", "البصرة", "أربيل", "الموصل"], answer: "أ)", sourcePages: [10] }, "MCQ", pages, "AR")?.answer).toBe("بغداد");
    expect(cleanQuestion({ prompt: "عاصمة العراق", options: ["بغداد", "البصرة", "أربيل", "الموصل"], answer: "دمشق", sourcePages: [10] }, "MCQ", pages, "AR")).toBeNull();
    expect(cleanQuestion({ prompt: "عاصمة العراق", options: ["بغداد", "بغداد"], answer: "بغداد", sourcePages: [10] }, "MCQ", pages, "AR")).toBeNull();
  });
  it("every question must cite a page inside the source range", () => {
    expect(cleanQuestion({ prompt: "عرّف الخلية", answer: "وحدة بناء…", sourcePages: [99] }, "DEFINE", pages, "AR")).toBeNull();
    expect(cleanQuestion({ prompt: "عرّف الخلية", answer: "وحدة بناء…", sourcePages: [] }, "DEFINE", pages, "AR")).toBeNull();
    expect(cleanQuestion({ prompt: "عرّف الخلية", answer: "وحدة بناء…", sourcePages: [12, 99, 12] }, "DEFINE", pages, "AR")?.sourcePages).toEqual([12]);
  });
  it("TRUE_FALSE answers are normalized, keeping the correction for false statements", () => {
    expect(cleanQuestion({ prompt: "الماء يغلي عند 100", answer: "صحيح", sourcePages: [10] }, "TRUE_FALSE", pages, "AR")?.answer).toBe("صح");
    expect(cleanQuestion({ prompt: "الشمس كوكب", answer: "خطأ - الشمس نجم", sourcePages: [10] }, "TRUE_FALSE", pages, "AR")?.answer).toBe("خطأ — الشمس نجم");
    expect(cleanQuestion({ prompt: "x", answer: "ربما", sourcePages: [10] }, "TRUE_FALSE", pages, "AR")).toBeNull();
    expect(cleanQuestion({ prompt: "The sun is a star", answer: "true", sourcePages: [10] }, "TRUE_FALSE", pages, "EN")?.answer).toBe("True");
  });
});

describe("sorting the model response into sections", () => {
  it("drops duplicates, wrong section indexes and extras beyond the requested count", () => {
    const sections = [{ type: "DEFINE" as const, count: 2, marksEach: 2 }, { type: "JUSTIFY" as const, count: 1, marksEach: 3 }];
    const raw = [
      { section: 0, prompt: "عرّف الخلية", answer: "a", sourcePages: [10] },
      { section: 0, prompt: "عرّف  الخلية", answer: "a", sourcePages: [11] }, // مكرر
      { section: 0, prompt: "عرّف النسيج", answer: "b", sourcePages: [11] },
      { section: 0, prompt: "عرّف العضو", answer: "c", sourcePages: [12] }, // زائد
      { section: 5, prompt: "?", answer: "x", sourcePages: [10] },
      { section: 1, prompt: "علّل: تحتاج النباتات للضوء", answer: "للبناء الضوئي", sourcePages: [12] },
    ];
    const r = sortIntoSections(raw, sections, pages, "AR");
    expect(r.bySection.map((s) => s.length)).toEqual([2, 1]);
    expect(r.dropped).toBe(3);
  });
});

describe("source pages", () => {
  it("expands chapter ranges, merges overlaps, samples across the whole range when too long", () => {
    expect(expandRanges([{ from: 5, to: 7 }, { from: 6, to: 9 }], 100)).toEqual({ pages: [5, 6, 7, 8, 9], truncated: false });
    const big = expandRanges([{ from: 1, to: 200 }], 200, 10);
    expect(big.truncated).toBe(true);
    expect(big.pages).toHaveLength(10);
    expect(big.pages[big.pages.length - 1]).toBeGreaterThan(150);
  });
  it("prefers OCR/weak pages for images, spread evenly", () => {
    const ps = Array.from({ length: 20 }, (_, i) => ({ pageNumber: i + 1, isOcr: i % 2 === 0, textLen: 500 }));
    const img = pickImagePages(ps, 4);
    expect(img.size).toBe(4);
    expect([...img].every((n) => n % 2 === 1)).toBe(true);
  });
  it("the prompt lists sections, page markers, and flags image/OCR pages", () => {
    const p = buildPrompt({ subject: "العلوم", grade: "الخامس الابتدائي", lang: "AR", difficulty: "MIXED", useLatinSymbols: false, sections: [{ type: "MCQ", count: 3, marksEach: 1 }], pages: [{ pageNumber: 10, text: "الخلية", isOcr: false, asImage: false }, { pageNumber: 11, text: "", isOcr: true, asImage: true }] });
    expect(p).toContain("section 0: MCQ × 3");
    expect(p).toContain("=== صفحة 10 ===\nالخلية");
    expect(p).toContain("Pages 11 are attached as IMAGES");
  });
});

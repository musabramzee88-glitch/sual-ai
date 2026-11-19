import { describe, expect, it } from "vitest";
import { buildReport, checkBook, contentFingerprint, fffdNature, formatReport, letterSpacedRatio, topGarbage, type BookCheckInput } from "./health";
import { reverseVisual } from "./text";

const PARA = "في هذا الدرس نتعلم كيف نجمع الأعداد الطبيعية ثم نقارن الناتج مع العدد الأول ونكتب الجواب في الدفتر، وبعد ذلك نحل التمارين التي على الصفحة.";
const page = (n: number, text: string, isOcr = false) => ({ pageNumber: n, text, isOcr });
const good = (n: number) => page(n, Array.from({ length: 6 }, () => PARA).join("\n"));

const base = (over: Partial<BookCheckInput> = {}): BookCheckInput => ({
  id: "b1", name: "كتاب.pdf", status: "READY", error: null, stale: false, sizeBytes: 1000, fileSizeOnDisk: 1000, pageCount: 20, textPageCount: 20, confirmed: true,
  pages: Array.from({ length: 20 }, (_, i) => good(i + 1)), detected: { gradeCode: "PRI_3", subjectCode: "MATH", kind: "TEXTBOOK", part: 0, confidence: "high" },
  curriculum: { id: "c1", title: "الرياضيات", gradeCode: "PRI_3", subjectCode: "MATH", kind: "TEXTBOOK", part: 0, chapters: [{ title: "الأول", pageStart: 1, pageEnd: 10 }, { title: "الثاني", pageStart: 11, pageEnd: 20 }], booksCount: 1 },
  ...over,
});
const codes = (b: BookCheckInput) => checkBook(b).issues.map((i) => i.code);

describe("checkBook", () => {
  it("a healthy, linked, confirmed book with chapters has no findings", () => {
    const r = checkBook(base());
    expect(r.issues).toEqual([]);
    expect(r.level).toBe("ok");
    expect(r.stats).toEqual({ pages: 20, textPages: 20, ocrPages: 0, blankPages: 0 });
  });

  it("detects visually reversed Arabic, and letter-by-letter extraction", () => {
    const reversed = Array.from({ length: 20 }, (_, i) => page(i + 1, PARA.split("،").map(reverseVisual).join("\n")));
    expect(codes(base({ pages: reversed }))).toContain("REVERSED_TEXT");
    const spaced = Array.from({ length: 20 }, (_, i) => page(i + 1, [...PARA.replace(/ /g, "  ")].join(" ")));
    expect(codes(base({ pages: spaced }))).toContain("LETTER_SPACED_TEXT");
    expect(letterSpacedRatio(PARA.repeat(3))).toBe(0);
  });

  it("flags garbage characters and wrong language for the subject", () => {
    const garbage = Array.from({ length: 20 }, (_, i) => page(i + 1, `${PARA}\n${"�".repeat(30)}`));
    expect(codes(base({ pages: garbage }))).toContain("GARBAGE_CHARS");
    const english = Array.from({ length: 20 }, (_, i) => page(i + 1, "This is an English page about my family and my school day. ".repeat(6)));
    expect(codes(base({ pages: english }))).toContain("LANGUAGE_MISMATCH"); // رياضيات بنص إنكليزي
    const ok = codes(base({ pages: english, curriculum: { ...base().curriculum!, subjectCode: "ENGLISH" }, detected: null }));
    expect(ok).not.toContain("LANGUAGE_MISMATCH");
  });

  it("reports file, status and OCR problems", () => {
    expect(codes(base({ fileSizeOnDisk: null }))).toContain("FILE_MISSING");
    expect(codes(base({ fileSizeOnDisk: 999 }))).toContain("FILE_SIZE_MISMATCH");
    expect(codes(base({ status: "FAILED", error: "NEEDS_OCR", pages: [], pageCount: 50 }))).toContain("FAILED_NEEDS_OCR");
    expect(codes(base({ status: "PROCESSING", stale: true }))).toContain("STUCK");
    const ocr = base({ pages: Array.from({ length: 20 }, (_, i) => page(i + 1, PARA, i < 5)) });
    expect(codes(ocr)).toContain("OCR_USED");
    const blanks = base({ textPageCount: 12, pages: Array.from({ length: 20 }, (_, i) => page(i + 1, i < 8 ? "" : PARA)) });
    expect(codes(blanks)).toContain("MANY_BLANK_PAGES");
  });

  it("checks curriculum consistency: cover mismatch, shared curriculum, chapters", () => {
    const mismatch = base({ detected: { gradeCode: "PRI_4", subjectCode: "SCIENCE", kind: "EXERCISES", part: 2, confidence: "high" } });
    const r = checkBook(mismatch).issues.find((i) => i.code === "COVER_MISMATCH")!;
    expect(r.detail).toContain("PRI_4");
    expect(r.detail).toContain("SCIENCE");
    expect(r.detail).toContain("الجزء");
    expect(codes(base({ detected: { gradeCode: "PRI_4", subjectCode: "SCIENCE", kind: "TEXTBOOK", confidence: "low" } }))).not.toContain("COVER_MISMATCH"); // الثقة المنخفضة لا تُنذر

    expect(codes(base({ curriculum: { ...base().curriculum!, booksCount: 2 } }))).toContain("SHARED_CURRICULUM");
    expect(codes(base({ curriculum: { ...base().curriculum!, chapters: [] } }))).toContain("NO_CHAPTERS");
    expect(codes(base({ curriculum: { ...base().curriculum!, chapters: [{ title: "س", pageStart: 1, pageEnd: 99 }] } }))).toContain("CHAPTER_PAGE_OUT_OF_RANGE");
    expect(codes(base({ curriculum: { ...base().curriculum!, chapters: [{ title: "أ", pageStart: 1, pageEnd: 12 }, { title: "ب", pageStart: 10, pageEnd: 20 }] } }))).toContain("CHAPTER_PAGES_OVERLAP");
    expect(codes(base({ curriculum: null }))).toContain("NOT_LINKED");
  });
});

describe("buildReport", () => {
  it("sorts errors first, summarizes, and finds duplicate content across different files", () => {
    const a = base({ id: "a", name: "a.pdf" }), b = base({ id: "b", name: "b.pdf" });
    const bad = base({ id: "c", name: "c.pdf", fileSizeOnDisk: null, pages: [page(1, "نص مختلف تماماً " + "كلمات أخرى ".repeat(40))] });
    const r = buildReport([a, b, bad]);
    expect(r.books[0].id).toBe("c"); // الخطأ أولاً
    expect(r.summary).toEqual({ total: 3, ok: 0, warn: 2, error: 1 });
    const dup = r.books.find((x) => x.id === "a")!.issues.find((i) => i.code === "DUPLICATE_CONTENT")!;
    expect(dup.detail).toBe("b.pdf");
    expect(contentFingerprint([page(1, "قصير")])).toBeNull();
  });

  it("formats a copyable text report without noise", () => {
    const txt = formatReport(buildReport([base({ id: "x", name: "x.pdf", fileSizeOnDisk: null })]));
    expect(txt).toContain("✗ x.pdf");
    expect(txt).toContain("ملف الكتاب غير موجود على القرص");
    expect(formatReport(buildReport([base()]))).toContain("✓ كتاب.pdf");
  });
});

describe("U+FFFD diagnosis", () => {
  it("separates replacement characters inside words (lost letters) from standalone ones (icons), with context", () => {
    const n = fffdNature("كتاب العل\uFFFDم الجميل \uFFFD عنوان \uFFFD\n");
    expect(n.inside).toBe(1);
    expect(n.alone).toBe(2);
    expect(n.samples[0]).toContain("العل\uFFFDم");
    const garbage = Array.from({ length: 20 }, (_, i) => ({ pageNumber: i + 1, text: `${PARA}\n${"كلمة\uFFFDضائعة ".repeat(15)}`, isOcr: false }));
    const detail = checkBook(base({ pages: garbage })).issues.find((x) => x.code === "GARBAGE_CHARS")?.detail ?? "";
    expect(detail).toContain("FFFD داخل كلمات");
    expect(detail).toContain("U+FFFD×");
  });
});

describe("report details", () => {
  it("shows which garbage code points dominate (icon bullets vs real corruption)", () => {
    expect(topGarbage("a\uF0B7\uF0B7\uF0B7b\uFFFD")).toBe("U+F0B7×3 U+FFFD×1");
    const garbage = Array.from({ length: 20 }, (_, i) => ({ pageNumber: i + 1, text: `${PARA}\n${"\uF0B7".repeat(40)}`, isOcr: false }));
    expect(checkBook(base({ pages: garbage })).issues.find((i) => i.code === "GARBAGE_CHARS")?.detail).toContain("U+F0B7");
  });
  it("a missing-chapters curriculum is informational, not a warning, and is counted in the header", () => {
    const b = base({ curriculum: { ...base().curriculum!, chapters: [] } });
    const r = checkBook(b);
    expect(r.issues.find((i) => i.code === "NO_CHAPTERS")?.severity).toBe("info");
    expect(r.level).toBe("ok");
    expect(formatReport(buildReport([b]))).toContain("كتب منهجها بلا فصول (مهمة قادمة، ليست خطأ): 1");
  });
});

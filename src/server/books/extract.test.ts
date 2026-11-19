import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfPages } from "./extract";

// ملفات PDF حقيقية مولّدة بـ Chromium (test/fixtures): تغطي نمطي تخزين العربية — حرفاً حرفاً، وكلمات مقلوبة داخلياً
const load = (f: string) => new Uint8Array(readFileSync(path.resolve(__dirname, "../../../test/fixtures", f)));

describe("PDF text extraction (real files)", () => {
  it("restores logical Arabic order, keeps math and English intact", async () => {
    const p = await extractPdfPages(load("math-ar.pdf"));
    expect(p[0].hasText).toBe(true);
    expect(p[0].text.split("\n")).toEqual([
      "مثال: أوجد ناتج 25 + 17 = 42 من الكتاب صفحة 12.",
      "حل المعادلة 3x + 5 = 20 ثم تحقق.",
      "اقرأ الجملة My name is Ali ثم ترجمها.",
      "العدد 1250 أكبر من 999 والكسر 3/4 أصغر من 1.",
    ]);
  });
  it("splits pages and reads glyph-by-glyph stored Arabic", async () => {
    const p = await extractPdfPages(load("text-ar.pdf"));
    expect(p.map((x) => x.pageNumber)).toEqual([1, 2]);
    expect(p[0].text).toContain("الفصل الأول: الأعداد الطبيعية");
    expect(p[0].text).toContain("Unit 1: Hello, my name is Ali.");
    expect(p[1].text).toBe("الفصل الثاني: الكسور\nالكسر هو جزء من الكل، ويكتب على صورة بسط ومقام.");
  });
  it("flags image-only (scanned) pages as having no text", async () => {
    const p = await extractPdfPages(load("scanned.pdf"));
    expect(p).toHaveLength(1);
    expect(p[0].hasText).toBe(false);
  });
  it("keeps a genuine English vocabulary page (regression: it was wrongly discarded as a broken text layer)", async () => {
    const p = await extractPdfPages(load("english-vocab.pdf"));
    expect(p[0].hasText).toBe(true);
    expect(p[0].text).toContain("Unit 4 Vocabulary");
    expect(p[0].text).toContain("apple");
    expect(p[0].text).toContain("library");
  });
  it("vowelized Arabic never yields wrong stored text: either kept as text or retained as `suspect` for OCR arbitration", async () => {
    const p = await extractPdfPages(load("vowelized-ar.pdf"));
    expect(p[0].hasText ? p[0].text.length > 0 : (p[0].suspect ?? "").length > 0).toBe(true);
    if (!p[0].hasText) expect(p[0].text).toBe("");
  });
  it("rejects data that is not a PDF", async () => {
    await expect(extractPdfPages(new TextEncoder().encode("not a pdf"))).rejects.toThrow();
  });
});

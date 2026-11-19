import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs"), os = require("node:os"), p = require("node:path");
  process.env.STORAGE_DIR = fs.mkdtempSync(p.join(os.tmpdir(), "sual-ocr-"));
});

import { ocrPdfPages, runOcrExclusive } from "./ocr";
import { cleanOcrText, hasOcrText } from "./text";

const fx = (f: string) => new Uint8Array(readFileSync(path.resolve(__dirname, "../../../test/fixtures", f)));

describe("OCR (local Tesseract, Arabic + English)", () => {
  it("reads an image-only Arabic/English page (no text layer in the PDF)", async () => {
    const progress: number[] = [];
    const [p] = await ocrPdfPages(fx("scanned-ar.pdf"), [1], (n) => void progress.push(n));
    expect(progress).toEqual([1]);
    expect(p.pageNumber).toBe(1);
    expect(p.hasText).toBe(true);
    // عبارات مستقرة (الأرقام داخل الجملة العربية قد يُعاد ترتيبها — لا نختبرها هنا عمداً)
    expect(p.text).toContain("الدرس الأول: الأعداد الطبيعية");
    expect(p.text).toContain("مثال: أوجد ناتج جمع 25 + 17");
    expect(p.text).toContain("Hello, my name is Sara");
    expect(p.text).not.toMatch(/[‎‏]/); // علامات الاتجاه تُزال
  }, 120_000);

  it("runs OCR jobs one at a time", async () => {
    const order: string[] = [];
    const slow = (n: string, ms: number) => runOcrExclusive(async () => { order.push(`start ${n}`); await new Promise((r) => setTimeout(r, ms)); order.push(`end ${n}`); });
    await Promise.all([slow("a", 40), slow("b", 5)]);
    expect(order).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("cleans OCR output: drops diacritics, bidi marks and 1-char noise lines", () => {
    expect(cleanOcrText("‎Unit‏ 1\nمَدْرَسَتِي\n.\n\nx")).toBe("Unit 1\nمدرستي");
    expect(hasOcrText("a .")).toBe(false);
    expect(hasOcrText("مدرستي الجميلة")).toBe(true);
  });
});

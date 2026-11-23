import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";

const chromium = process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : "");
if (chromium) process.env.CHROMIUM_PATH = chromium;

const { DEFAULT_TEMPLATE, renderExamHtml } = await import("@/lib/exam-render");
const { fitToPages, fitInput, countPdfPages } = await import("./fit");
const { htmlToPdf } = await import("./pdf");

const mk = (n: number, per: number) => ({
  lang: "AR" as const, values: { title: "اختبار", subject: "الفيزياء", grade: "الثالث المتوسط", time: "٤٥ دقيقة", total: "١٠٠ درجة" },
  sections: Array.from({ length: n }, (_, s) => ({ instruction: `تعليمة ${s + 1}:`, marks: 10, branches: Array.from({ length: per }, (_, j) => ({ prompt: `سؤال ${s + 1}-${j + 1}: ما هي العملية التي يصنع بها النبات غذاءه باستعمال ضوء الشمس والماء وثنائي أكسيد الكربون؟`, options: null, answer: "", marks: 2 })) })),
});

describe("page counting", () => {
  it("counts the pages of a PDF (not the page tree)", () => {
    expect(countPdfPages(Buffer.from("%PDF /Type /Pages /Kids [1 0 R 2 0 R] 1 0 obj << /Type /Page >> 2 0 obj << /Type /Page /X >>"))).toBe(2);
    expect(countPdfPages(Buffer.from("no pdf here"))).toBe(0);
  });
});

describe.skipIf(!chromium)("fitting the question paper to two pages (double-sided printing)", () => {
  it("a small exam is left exactly as is; a bigger one is shrunk to fit; the real PDF confirms the page count", async () => {
    const small = await fitToPages(mk(3, 3), DEFAULT_TEMPLATE, "QUESTIONS_ONLY", 2);
    expect(small.info).toMatchObject({ fits: true, step: 0, adjusted: false });
    expect(small.tpl).toBe(DEFAULT_TEMPLATE);
    for (const [n, per] of [[6, 4], [9, 4]] as const) {
      const f = await fitToPages(mk(n, per), DEFAULT_TEMPLATE, "QUESTIONS_ONLY", 2);
      expect(f.info.fits).toBe(true);
      expect(f.info.adjusted).toBe(true);
      expect(f.tpl.fontSizePt).toBeLessThan(DEFAULT_TEMPLATE.fontSizePt);
      expect(f.tpl.fontSizePt).toBeGreaterThanOrEqual(11);
      const real = countPdfPages(await htmlToPdf(renderExamHtml(mk(n, per), f.tpl, "QUESTIONS_ONLY", { forPdf: true }), { pageNumbers: true, lang: "ar" }));
      expect(real).toBeLessThanOrEqual(2);
    }
  }, 120_000);
  it("as a last resort allows splitting a question, and reports honestly when even that does not fit", async () => {
    const tight = await fitToPages(mk(12, 5), DEFAULT_TEMPLATE, "QUESTIONS_ONLY", 2);
    expect(tight.info.fits).toBe(true);
    expect(tight.info.keep).toBe(false);
    const huge = await fitToPages(mk(20, 6), DEFAULT_TEMPLATE, "QUESTIONS_ONLY", 2);
    expect(huge.info.fits).toBe(false);
    expect(huge.info.pages).toBeGreaterThan(2);
    expect(huge.tpl.fontSizePt).toBe(11); // أصغر تنسيق مقروء
  }, 120_000);
  it("is cached, and the limit applies only to the question copy", async () => {
    const a = await fitToPages(mk(6, 4), DEFAULT_TEMPLATE, "QUESTIONS_ONLY", 2);
    expect(await fitToPages(mk(6, 4), DEFAULT_TEMPLATE, "QUESTIONS_ONLY", 2)).toBe(a);
    const input = { renderExam: mk(9, 4), renderTemplate: DEFAULT_TEMPLATE, template: { maxPages: 2 } };
    expect((await fitInput(input, "QUESTIONS_ONLY")).info?.fits).toBe(true);
    expect((await fitInput(input, "WITH_ANSWERS")).info).toBeNull();
    expect((await fitInput(input, "ANSWER_KEY")).tpl).toBe(DEFAULT_TEMPLATE);
    expect((await fitInput({ ...input, template: { maxPages: 0 } }, "QUESTIONS_ONLY")).info).toBeNull(); // 0 = بلا حد
    expect((await fitInput({ ...input, template: { maxPages: 3 } }, "QUESTIONS_ONLY")).info?.max).toBe(3);
  }, 120_000);
  it("browser print gives every page its top margin and the same page count as the PDF export", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const e = mk(10, 4);
    const counts: number[] = [];
    for (const forPdf of [false, true]) {
      const pdf = await htmlToPdf(renderExamHtml(e, DEFAULT_TEMPLATE, "QUESTIONS_ONLY", { forPdf }), { pageNumbers: false, lang: "ar" });
      counts.push(countPdfPages(pdf));
      const doc = await getDocument({ data: new Uint8Array(pdf) }).promise;
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const h = (page.view as number[])[3];
        const ys = (await page.getTextContent()).items.map((i) => ("transform" in i ? (i.transform as number[])[5] : 0)).filter((y) => y > 0);
        expect(h - Math.max(...ys), `page ${p} forPdf=${forPdf}`).toBeGreaterThan(25); // 12mm ≈ 34pt: لا نص يلامس حافة الورقة العلوية
      }
    }
    expect(counts[0]).toBe(counts[1]);
  }, 120_000);
});

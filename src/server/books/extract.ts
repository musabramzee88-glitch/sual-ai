import "server-only";
import { assembleLines, cleanPageText, hasRealText, type PositionedItem } from "./text";

export type ExtractedPage = { pageNumber: number; text: string; hasText: boolean };

/**
 * يستخرج نص كل صفحة من PDF (بلا OCR). يُرجع الصفحات بالترتيب؛ الصفحة المصوّرة نصها فارغ تقريباً.
 * لا يُنفَّذ أي محتوى من الملف (JavaScript/خطوط) — للعرض النصي فقط.
 */
export async function extractPdfPages(data: Uint8Array, onPage?: (n: number, total: number) => void): Promise<ExtractedPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false, verbosity: 0 }).promise;
  try {
    const pages: ExtractedPage[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items: PositionedItem[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [a, b, , , e, f] = item.transform as number[];
        items.push({ str: item.str, x: e, y: f, w: item.width, h: item.height || Math.hypot(a, b) });
      }
      // الترتيب حسب الموضع لا حسب التخزين (كثير من ملفات PDF العربية مخزّنة بالترتيب المرئي)
      const text = cleanPageText(assembleLines(items));
      pages.push({ pageNumber: i, text, hasText: hasRealText(text) });
      page.cleanup();
      onPage?.(i, doc.numPages);
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

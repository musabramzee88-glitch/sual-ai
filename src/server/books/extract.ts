import "server-only";
import { assembleLines, cleanPageText, hasRealText, isGarbageText, type PositionedItem } from "./text";

/** suspect: نص طبقة معطوبة لم يُعتمد (للتحكيم مع OCR لاحقاً) */
export type ExtractedPage = { pageNumber: number; text: string; hasText: boolean; suspect?: string };

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
      const raw = cleanPageText(assembleLines(items));
      // طبقة نص معطوبة: لا نخزّن الفاسد، وتُعامل الصفحة كبلا نص (تُقرأ بـ OCR إن كان مفعّلاً)
      const garbage = isGarbageText(raw);
      const text = garbage ? "" : raw;
      pages.push({ pageNumber: i, text, hasText: !garbage && hasRealText(text), ...(garbage && raw ? { suspect: raw } : {}) });
      page.cleanup();
      onPage?.(i, doc.numPages);
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

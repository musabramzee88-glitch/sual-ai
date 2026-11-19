import "server-only";
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";
import { cleanOcrText, hasOcrText } from "./text";

/** OCR محلي: pdf.js يرسم الصفحة صورة، وTesseract يقرأ العربية والإنكليزية. بدون خدمات خارجية. */
export const ocrEnabled = () => env.OCR_ENABLED === "true";

const SCALE = 2; // ≈ 144 DPI: جودة مقاربة لـ 216 DPI بقياساتنا وأسرع بنحو الثلث
const MAX_SIDE = 3600;

/**
 * يجمع ملفات اللغة (عربي + إنكليزي) في مجلد واحد يتوقعه Tesseract، من حزم npm المثبّتة (بلا تنزيل وقت التشغيل).
 * المسار من جذر المشروع (cwd) وليس عبر require.resolve لأن Next يجمّع الكود فيكسر الحل الديناميكي.
 */
async function ensureLangDir(): Promise<string> {
  const dir = path.resolve(env.STORAGE_DIR, "ocr-lang");
  await mkdir(dir, { recursive: true });
  for (const lang of ["ara", "eng"] as const) {
    const target = path.join(dir, `${lang}.traineddata.gz`);
    try {
      await stat(target);
    } catch {
      const src = path.join(process.cwd(), "node_modules", "@tesseract.js-data", lang, "4.0.0_best_int", `${lang}.traineddata.gz`);
      await copyFile(src, target).catch(() => {
        throw new Error(`OCR language data missing: ${lang} (run npm install)`);
      });
    }
  }
  return dir;
}

/** تحسين خفيف للصور الملونة (كتب الأطفال): تدرّج رمادي + تمطيط التباين بين المئينين 2% و98% */
function autoLevel(data: Uint8ClampedArray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const g = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    hist[g | 0]++;
    data[i] = data[i + 1] = data[i + 2] = g;
  }
  const total = data.length / 4;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
  if (hi - lo < 40) return; // صفحة شبه فارغة/منخفضة التباين أصلاً
  const k = 255 / (hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.max(0, Math.min(255, (data[i] - lo) * k));
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

// طابور واحد: OCR ثقيل على المعالج والذاكرة، فلا يعمل أكثر من كتاب في وقت واحد
let queue: Promise<unknown> = Promise.resolve();
export function runOcrExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

export type OcrPage = { pageNumber: number; text: string; hasText: boolean };

/** يقرأ الصفحات المطلوبة فقط من PDF. onPage يُستدعى بعد كل صفحة (للتقدّم ونبض الحياة). */
export async function ocrPdfPages(data: Uint8Array, pageNumbers: number[], onPage?: (done: number, total: number) => Promise<void> | void): Promise<OcrPage[]> {
  const [{ createWorker }, { createCanvas }, pdfjs, langPath] = await Promise.all([
    import("tesseract.js"), import("@napi-rs/canvas"), import("pdfjs-dist/legacy/build/pdf.mjs"), ensureLangDir(),
  ]);
  const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const worker = await createWorker("ara+eng", 1, { langPath, gzip: true, cacheMethod: "none", logger: () => {} });
  try {
    const out: OcrPage[] = [];
    for (const [i, n] of pageNumbers.entries()) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(SCALE, MAX_SIDE / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp }).promise;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      autoLevel(img.data);
      ctx.putImageData(img, 0, 0);
      const { data: r } = await worker.recognize(canvas.toBuffer("image/png"));
      const text = cleanOcrText(r.text);
      out.push({ pageNumber: n, text, hasText: hasOcrText(text) });
      page.cleanup();
      await onPage?.(i + 1, pageNumbers.length);
    }
    return out;
  } finally {
    await worker.terminate();
    await doc.destroy();
  }
}

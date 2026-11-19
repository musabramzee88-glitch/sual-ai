import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { coverFile, fileOf, withExtractSlot } from "./service";

const WIDTH = 360;

/**
 * صورة غلاف الكتاب المصغّرة (JPEG): تُنشأ عند أول طلب من الصفحة الأولى وتُخزَّن في STORAGE_DIR/covers.
 * تُمكّن المراجعة البصرية السريعة (تتأكد بنظرة أن الكتاب هو ما قرأه النظام). الرسم يمر بالسقف المشترك للذاكرة.
 */
export async function getCoverImage(bookId: string): Promise<Buffer | null> {
  const book = await db.uploadedBook.findUnique({ where: { id: bookId }, select: { storageKey: true } });
  if (!book) return null;
  const target = coverFile(bookId);
  try {
    return await readFile(target);
  } catch {
    /* لم تُنشأ بعد */
  }
  return withExtractSlot(async () => {
    const [{ createCanvas }, pdfjs] = await Promise.all([import("@napi-rs/canvas"), import("pdfjs-dist/legacy/build/pdf.mjs")]);
    const data = new Uint8Array(await readFile(fileOf(book.storageKey)));
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: WIDTH / base.width });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp }).promise;
      const jpg = canvas.toBuffer("image/jpeg", 72);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, jpg);
      return jpg;
    } finally {
      await doc.destroy();
    }
  });
}

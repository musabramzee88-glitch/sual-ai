import "server-only";

/**
 * يرسم صفحات PDF صوراً JPEG (لإرسالها لنموذج رؤية). الضلع الأطول ≤ maxSide.
 * pdf.js يستولي على المخزن الممرَّر، لذلك نمرّر نسخة.
 */
export async function renderPagesJpeg(data: Uint8Array, pageNumbers: number[], maxSide = 1600): Promise<{ pageNumber: number; jpeg: Buffer }[]> {
  const [{ createCanvas }, pdfjs] = await Promise.all([import("@napi-rs/canvas"), import("pdfjs-dist/legacy/build/pdf.mjs")]);
  const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  try {
    const out: { pageNumber: number; jpeg: Buffer }[] = [];
    for (const n of pageNumbers) {
      if (n < 1 || n > doc.numPages) continue;
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(3, maxSide / Math.max(base.width, base.height)) });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp }).promise;
      out.push({ pageNumber: n, jpeg: canvas.toBuffer("image/jpeg", 85) });
      page.cleanup();
    }
    return out;
  } finally {
    await doc.destroy();
  }
}

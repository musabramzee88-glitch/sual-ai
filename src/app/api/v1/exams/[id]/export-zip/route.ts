import { z } from "zod";
import { fail } from "@/server/http";
import { limit } from "@/server/auth/route";
import { db } from "@/server/db";
import { requireExamAccess } from "@/server/exams/access";
import { notFound } from "@/server/exams/route";
import { buildZip, MIME } from "@/server/exams/export";
import { PdfUnavailable } from "@/server/exams/pdf";
import { contentDisposition, safeFileName } from "@/lib/file-name";
import { MODEL_LABELS, type ModelLabel } from "@/lib/exam-models";

export const runtime = "nodejs";
export const maxDuration = 300;

const list = <T extends string>(allowed: readonly T[]) =>
  z.string().max(40).transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.enum(allowed as [T, ...T[]])).max(allowed.length));
const q = z.object({
  format: z.enum(["pdf", "docx"]).default("pdf"),
  models: list(MODEL_LABELS).optional(), // فارغ/غائب = بلا نموذج (الأصل)
  variants: list(["questions", "answers", "key", "sheet"] as const).pipe(z.array(z.string()).min(1)).default("questions"),
  template: z.string().min(5).max(40).optional(),
  name: z.string().max(200).optional(),
});

/** حزمة ZIP: ملف لكل (نموذج × نسخة) بالصيغة المختارة (حتى 16 ملفاً) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const u = g.auth.user.id;
  const p = q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return fail(400, "VALIDATION_ERROR", "Invalid parameters");
  const rl = await limit([[`zip:m:${u}`, 3, 600], [`zip:d:${u}`, 60, 86_400]]);
  if (rl) return rl;
  const examId = (await params).id;
  const models: (ModelLabel | null)[] = p.data.models?.length ? (p.data.models as ModelLabel[]) : [null];
  const variants = [...new Set(p.data.variants as ("questions" | "answers" | "key" | "sheet")[])];
  const row = await db.examExport.create({ data: { examId, requestedById: u, format: "ZIP", variant: "QUESTIONS_ONLY", modelLabels: models.map((m) => m ?? "A"), status: "RUNNING" } }).catch(() => null);
  try {
    const z = await buildZip(u, examId, { format: p.data.format, models, variants, template: p.data.template });
    if (!z) {
      if (row) await db.examExport.delete({ where: { id: row.id } }).catch(() => {});
      return notFound();
    }
    if (row) await db.examExport.update({ where: { id: row.id }, data: { status: "SUCCEEDED", completedAt: new Date() } });
    const name = safeFileName(p.data.name, z.title, "zip");
    return new Response(new Uint8Array(z.bytes), { headers: { "content-type": MIME.zip, "content-disposition": contentDisposition(name, `exam-${examId.slice(-6)}.zip`), "cache-control": "no-store" } });
  } catch (e) {
    const unavailable = e instanceof PdfUnavailable;
    console.error(`[export] zip failed: ${(e as Error).message.split("\n")[0]}`);
    if (row) await db.examExport.update({ where: { id: row.id }, data: { status: "FAILED", error: unavailable ? "NO_BROWSER" : "RENDER_FAILED", completedAt: new Date() } }).catch(() => {});
    return fail(503, unavailable ? "PDF_UNAVAILABLE" : "PDF_FAILED", unavailable ? "No Chromium/Edge/Chrome found on the server (set CHROMIUM_PATH)" : "Export failed");
  }
}

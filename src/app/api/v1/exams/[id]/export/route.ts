import { z } from "zod";
import { fail } from "@/server/http";
import { limit } from "@/server/auth/route";
import { db } from "@/server/db";
import { requireExamAccess } from "@/server/exams/access";
import { notFound } from "@/server/exams/route";
import { buildFile, fileNameOf, MIME, VARIANT } from "@/server/exams/export";
import { PdfUnavailable } from "@/server/exams/pdf";
import { contentDisposition } from "@/lib/file-name";

export const runtime = "nodejs";
export const maxDuration = 120;

const q = z.object({
  variant: z.enum(["questions", "answers", "key", "sheet"]).default("questions"),
  format: z.enum(["pdf", "docx"]).default("pdf"),
  model: z.enum(["A", "B", "C", "D"]).optional(),
  template: z.string().min(5).max(40).optional(),
  name: z.string().max(200).optional(),
});

/** تنزيل ورقة الامتحان PDF أو Word (الأسئلة، مع الإجابات، الإجابات النموذجية، ورقة الإجابة) بالقالب المحفوظ، ولأي نموذج A–D */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const u = g.auth.user.id;
  const p = q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return fail(400, "VALIDATION_ERROR", "Invalid parameters");
  const rl = await limit([[`pdf:m:${u}`, 10, 60], [`pdf:d:${u}`, 300, 86_400]]);
  if (rl) return rl;
  const examId = (await params).id;
  const row = await db.examExport.create({
    data: { examId, requestedById: u, format: p.data.format === "docx" ? "DOCX" : "PDF", variant: VARIANT[p.data.variant], modelLabels: [p.data.model ?? "A"], status: "RUNNING" },
  }).catch(() => null); // معرّف غير موجود: يُرفض أدناه
  try {
    const f = await buildFile(u, examId, { format: p.data.format, variant: p.data.variant, model: p.data.model, template: p.data.template });
    if (!f) {
      if (row) await db.examExport.delete({ where: { id: row.id } }).catch(() => {});
      return notFound();
    }
    if (row) await db.examExport.update({ where: { id: row.id }, data: { status: "SUCCEEDED", completedAt: new Date() } });
    return new Response(new Uint8Array(f.bytes), {
      headers: { "content-type": MIME[f.ext], "content-disposition": contentDisposition(fileNameOf(f, p.data.name), f.ascii), "cache-control": "no-store" },
    });
  } catch (e) {
    const unavailable = e instanceof PdfUnavailable;
    console.error(`[export] failed: ${(e as Error).message.split("\n")[0]}`);
    if (row) await db.examExport.update({ where: { id: row.id }, data: { status: "FAILED", error: unavailable ? "NO_BROWSER" : "RENDER_FAILED", completedAt: new Date() } }).catch(() => {});
    return fail(503, unavailable ? "PDF_UNAVAILABLE" : "PDF_FAILED", unavailable ? "No Chromium/Edge/Chrome found on the server (set CHROMIUM_PATH)" : "Export failed");
  }
}

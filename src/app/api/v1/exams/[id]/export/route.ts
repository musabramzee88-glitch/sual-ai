import { z } from "zod";
import { fail } from "@/server/http";
import { limit } from "@/server/auth/route";
import { db } from "@/server/db";
import { requireExamAccess } from "@/server/exams/access";
import { notFound } from "@/server/exams/route";
import { examRenderInput } from "@/server/exams/templates";
import { htmlToPdf, PdfUnavailable } from "@/server/exams/pdf";
import { renderExamHtml } from "@/lib/exam-render";

export const runtime = "nodejs";
export const maxDuration = 120;

const VARIANT = { questions: "QUESTIONS_ONLY", answers: "WITH_ANSWERS", key: "ANSWER_KEY" } as const;
const q = z.object({ variant: z.enum(["questions", "answers", "key"]).default("questions"), template: z.string().min(5).max(40).optional() });

/** تنزيل ورقة الامتحان PDF (الأسئلة، أو مع الإجابات، أو الإجابات النموذجية) بالقالب المحفوظ للامتحان */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const u = g.auth.user.id;
  const p = q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return fail(400, "VALIDATION_ERROR", "Invalid parameters");
  const rl = await limit([[`pdf:m:${u}`, 10, 60], [`pdf:d:${u}`, 300, 86_400]]);
  if (rl) return rl;
  const input = await examRenderInput(u, (await params).id, { templateId: p.data.template });
  if (!input) return notFound();
  const variant = VARIANT[p.data.variant];
  const html = renderExamHtml(input.renderExam, input.renderTemplate, variant, { forPdf: true });
  const lang = input.exam.language === "EN" ? "en" : "ar";
  const row = await db.examExport.create({ data: { examId: input.exam.id, requestedById: u, format: "PDF", variant, modelLabels: ["A"], status: "RUNNING" } });
  try {
    const pdf = await htmlToPdf(html, { pageNumbers: input.template.showPageNumbers, lang });
    await db.examExport.update({ where: { id: row.id }, data: { status: "SUCCEEDED", completedAt: new Date() } });
    const base = `exam-${input.exam.id.slice(-6)}${p.data.variant === "questions" ? "" : `-${p.data.variant}`}.pdf`;
    const pretty = `${input.exam.title.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 80) || "exam"}${p.data.variant === "key" ? (lang === "ar" ? " - الإجابات" : " - key") : p.data.variant === "answers" ? (lang === "ar" ? " - مع الإجابات" : " - with answers") : ""}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${base}"; filename*=UTF-8''${encodeURIComponent(pretty)}`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    const unavailable = e instanceof PdfUnavailable;
    console.error(`[pdf] export failed: ${(e as Error).message.split("\n")[0]}`);
    await db.examExport.update({ where: { id: row.id }, data: { status: "FAILED", error: unavailable ? "NO_BROWSER" : "RENDER_FAILED", completedAt: new Date() } });
    return fail(503, unavailable ? "PDF_UNAVAILABLE" : "PDF_FAILED", unavailable ? "No Chromium/Edge/Chrome found on the server (set CHROMIUM_PATH)" : "PDF export failed");
  }
}

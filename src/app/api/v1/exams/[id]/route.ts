import { z } from "zod";
import { ok } from "@/server/http";
import { limit, parseBody } from "@/server/auth/route";
import { requireExamAccess } from "@/server/exams/access";
import { GENERATABLE } from "@/server/exams/core";
import { notFound, respondExam } from "@/server/exams/route";
import { addSection, deleteExam, distributeExamMarks, getExam, reorderSections, updateExamMeta } from "@/server/exams/service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const e = await getExam(g.auth.user.id, (await params).id);
  return e ? ok(e) : notFound();
}

const id = z.string().min(10).max(40);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("meta"), title: z.string().trim().min(1).max(150).optional(), durationMinutes: z.number().int().min(5).max(300).nullable().optional() }),
  z.object({ action: z.literal("distribute"), total: z.number().int().min(1).max(1000), mode: z.enum(["smart", "equal"]) }),
  z.object({ action: z.literal("reorderSections"), ids: z.array(id).min(1).max(20) }),
  z.object({ action: z.literal("addSection"), type: z.enum(GENERATABLE), count: z.number().int().min(1).max(20), marksEach: z.number().int().min(1).max(50) }),
]);

/** تحرير الامتحان: العنوان والمدة، توزيع الدرجات، ترتيب الأقسام، قسم جديد يُولَّد */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const examId = (await params).id, u = g.auth.user.id, d = b.data;
  if (d.action === "meta") return respondExam(await updateExamMeta(u, examId, { title: d.title, durationMinutes: d.durationMinutes }));
  if (d.action === "distribute") return respondExam(await distributeExamMarks(u, examId, d.total, d.mode));
  if (d.action === "reorderSections") return respondExam(await reorderSections(u, examId, d.ids));
  const rl = await limit([[`gen:m:${u}`, 2, 60], [`gen:d:${u}`, 30, 86_400]]);
  if (rl) return rl;
  return respondExam(await addSection(u, examId, { type: d.type, count: d.count, marksEach: d.marksEach }));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  return respondExam(await deleteExam(g.auth.user.id, (await params).id));
}

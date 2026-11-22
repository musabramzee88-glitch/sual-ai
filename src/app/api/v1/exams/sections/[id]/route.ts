import { z } from "zod";
import { limit, parseBody } from "@/server/auth/route";
import { requireExamAccess } from "@/server/exams/access";
import { respondExam } from "@/server/exams/route";
import { addManualQuestion, deleteSection, duplicateSection, generateMore, reorderQuestions, updateSection } from "@/server/exams/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/** تعديل قسم: نص التعليمة و/أو درجته (تُقسم على فروعه) و/أو عدد الفروع التي يجيب عنها الطالب (null = كلها) */
const patchSchema = z.object({ instruction: z.string().trim().min(1).max(400).optional(), marks: z.number().min(0.5).max(1000).optional(), answerCount: z.number().int().min(1).max(50).nullable().optional() });
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const b = await parseBody(req, patchSchema);
  if ("res" in b) return b.res;
  return respondExam(await updateSection(g.auth.user.id, (await params).id, b.data));
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addManual"), prompt: z.string().trim().min(1).max(1500), answer: z.string().trim().min(1).max(3000), options: z.array(z.string().trim().min(1).max(300)).min(2).max(6).nullable().optional(), marks: z.number().min(0.5).max(100).optional() }),
  z.object({ action: z.literal("duplicate") }),
  z.object({ action: z.literal("generateMore"), count: z.number().int().min(1).max(10) }),
  z.object({ action: z.literal("reorder"), ids: z.array(z.string().min(10).max(40)).min(1).max(40) }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const b = await parseBody(req, actionSchema);
  if ("res" in b) return b.res;
  const sid = (await params).id, u = g.auth.user.id, d = b.data;
  if (d.action === "addManual") return respondExam(await addManualQuestion(u, sid, { prompt: d.prompt, answer: d.answer, options: d.options, marks: d.marks }));
  if (d.action === "reorder") return respondExam(await reorderQuestions(u, sid, d.ids));
  if (d.action === "duplicate") return respondExam(await duplicateSection(u, sid));
  const rl = await limit([[`regen:m:${u}`, 6, 60], [`regen:d:${u}`, 100, 86_400]]);
  if (rl) return rl;
  return respondExam(await generateMore(u, sid, d.count));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  return respondExam(await deleteSection(g.auth.user.id, (await params).id));
}

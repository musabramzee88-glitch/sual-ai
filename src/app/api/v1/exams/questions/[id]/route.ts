import { z } from "zod";
import { limit, parseBody } from "@/server/auth/route";
import { requireExamAccess } from "@/server/exams/access";
import { respondExam } from "@/server/exams/route";
import { deleteQuestion, editQuestion, regenerateQuestion, undoQuestion } from "@/server/exams/service";

export const runtime = "nodejs";
export const maxDuration = 120;

const editSchema = z.object({
  prompt: z.string().trim().min(1).max(1500).optional(),
  options: z.array(z.string().trim().min(1).max(300)).min(2).max(6).nullable().optional(),
  answer: z.string().trim().min(1).max(3000).optional(),
  marks: z.number().min(0).max(100).optional(),
});

/** تعديل سؤال (يُحفظ في سجل التعديلات) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const b = await parseBody(req, editSchema);
  if ("res" in b) return b.res;
  return respondExam(await editQuestion(g.auth.user.id, (await params).id, b.data));
}

const actionSchema = z.object({ action: z.enum(["regenerate", "undo"]) });

/** إعادة توليد سؤال واحد، أو التراجع عن آخر تغيير */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const b = await parseBody(req, actionSchema);
  if ("res" in b) return b.res;
  const id = (await params).id;
  if (b.data.action === "undo") return respondExam(await undoQuestion(g.auth.user.id, id));
  const rl = await limit([[`regen:m:${g.auth.user.id}`, 6, 60], [`regen:d:${g.auth.user.id}`, 100, 86_400]]);
  if (rl) return rl;
  return respondExam(await regenerateQuestion(g.auth.user.id, id));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  return respondExam(await deleteQuestion(g.auth.user.id, (await params).id));
}

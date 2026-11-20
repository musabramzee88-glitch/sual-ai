import { ok } from "@/server/http";
import { requireExamAccess } from "@/server/exams/access";
import { notFound, respondExam } from "@/server/exams/route";
import { deleteExam, getExam } from "@/server/exams/service";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const e = await getExam(g.auth.user.id, (await params).id);
  return e ? ok(e) : notFound();
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  return respondExam(await deleteExam(g.auth.user.id, (await params).id));
}

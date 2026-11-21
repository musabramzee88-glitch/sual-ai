import { limit, parseBody } from "@/server/auth/route";
import { requireExamAccess } from "@/server/exams/access";
import { respondExam } from "@/server/exams/route";
import { deleteTemplate, templateSchema, updateTemplate } from "@/server/exams/templates";

export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const rl = await limit([[`tpl:${g.auth.user.id}`, 60, 3600]]);
  if (rl) return rl;
  const b = await parseBody(req, templateSchema);
  if ("res" in b) return b.res;
  return respondExam(await updateTemplate(g.auth.user.id, (await params).id, b.data));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  return respondExam(await deleteTemplate(g.auth.user.id, (await params).id));
}

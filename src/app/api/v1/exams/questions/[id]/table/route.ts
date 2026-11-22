import { z } from "zod";
import { parseBody } from "@/server/auth/route";
import { requireExamAccess } from "@/server/exams/access";
import { respondExam } from "@/server/exams/route";
import { setQuestionTable, tableSchema } from "@/server/exams/media";

export const runtime = "nodejs";

/** يضع جدولاً للسؤال، أو يزيله (table: null) */
const body = z.object({ table: tableSchema.nullable() });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const b = await parseBody(req, body);
  if ("res" in b) return b.res;
  return respondExam(await setQuestionTable(g.auth.user.id, (await params).id, b.data.table));
}

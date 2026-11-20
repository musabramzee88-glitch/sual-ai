import { ok } from "@/server/http";
import { limit, parseBody } from "@/server/auth/route";
import { requireExamAccess } from "@/server/exams/access";
import { createExamSchema } from "@/server/exams/core";
import { respondExam } from "@/server/exams/route";
import { createExam, listExams } from "@/server/exams/service";

export const runtime = "nodejs";
// التوليد يستغرق عادة 20–90 ثانية
export const maxDuration = 300;

export async function GET() {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  return ok(await listExams(g.auth.user.id));
}

export async function POST(req: Request) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  // حدود لكل مدرس: 2 بالدقيقة و30 باليوم (حماية حصة الذكاء الاصطناعي)
  const rl = await limit([[`gen:m:${g.auth.user.id}`, 2, 60], [`gen:d:${g.auth.user.id}`, 30, 86_400]]);
  if (rl) return rl;
  const b = await parseBody(req, createExamSchema);
  if ("res" in b) return b.res;
  return respondExam(await createExam(g.auth.user.id, b.data));
}

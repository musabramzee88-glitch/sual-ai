import { ok } from "@/server/http";
import { requireExamAccess } from "@/server/exams/access";
import { examOptions } from "@/server/exams/service";

export const runtime = "nodejs";

/** المناهج المتاحة للتوليد (بكتاب جاهز) مع فصولها */
export async function GET() {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  return ok(await examOptions());
}

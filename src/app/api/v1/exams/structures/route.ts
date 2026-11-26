import { ok } from "@/server/http";
import { requireExamAccess } from "@/server/exams/access";
import { listStructures } from "@/server/exams/service";

export const runtime = "nodejs";

/** هياكل آخر الامتحانات الجاهزة (لـ«امتحان بنفس هيكل سابق» في التطبيق) */
export async function GET() {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  return ok(await listStructures(g.auth.user.id));
}

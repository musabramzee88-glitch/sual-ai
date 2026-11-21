import { ok } from "@/server/http";
import { limit, parseBody } from "@/server/auth/route";
import { requireExamAccess } from "@/server/exams/access";
import { respondExam } from "@/server/exams/route";
import { createTemplate, listTemplates, templateSchema } from "@/server/exams/templates";
import { getLocale } from "@/lib/i18n/server";

export const runtime = "nodejs";

/** قوالب المدرس + القوالب الجاهزة */
export async function GET() {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  return ok(await listTemplates(g.auth.user.id, (await getLocale()) === "en" ? "en" : "ar"));
}

export async function POST(req: Request) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const rl = await limit([[`tpl:${g.auth.user.id}`, 60, 3600]]);
  if (rl) return rl;
  const b = await parseBody(req, templateSchema);
  if ("res" in b) return b.res;
  return respondExam(await createTemplate(g.auth.user.id, b.data));
}

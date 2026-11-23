import { ok } from "@/server/http";
import { requireAuth } from "@/server/auth/route";
import { cardStatus } from "@/server/billing/card";
import { notFound } from "@/server/exams/route";

export const runtime = "nodejs";

/** حالة دفعة المستخدم نفسه (لصفحة العودة) */
export async function GET(_req: Request, { params }: { params: Promise<{ reference: string }> }) {
  const g = await requireAuth();
  if ("res" in g) return g.res;
  const s = await cardStatus(g.auth.user.id, (await params).reference.slice(0, 40));
  return s ? ok(s) : notFound();
}

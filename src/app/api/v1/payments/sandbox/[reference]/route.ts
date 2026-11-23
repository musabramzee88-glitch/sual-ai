import { z } from "zod";
import { fail, ok } from "@/server/http";
import { limit, parseBody, requireAuth } from "@/server/auth/route";
import { completeSandbox } from "@/server/billing/card";

export const runtime = "nodejs";

const schema = z.object({ outcome: z.enum(["SUCCEEDED", "FAILED"]) });

/** البوابة التجريبية فقط: يحاكي نتيجة الدفع عبر إشعار موقّع يمر على مسار التحقق نفسه */
export async function POST(req: Request, { params }: { params: Promise<{ reference: string }> }) {
  const g = await requireAuth();
  if ("res" in g) return g.res;
  const rl = await limit([[`sandbox:${g.auth.user.id}`, 20, 3600]]);
  if (rl) return rl;
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const r = await completeSandbox(g.auth.user.id, (await params).reference.slice(0, 40), b.data.outcome);
  return r.ok ? ok(r) : fail(r.code === "NOT_FOUND" ? 404 : 403, r.code, "Refused");
}

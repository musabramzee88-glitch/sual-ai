import { z } from "zod";
import { fail } from "@/server/http";
import { limit, parseBody, requireAuth } from "@/server/auth/route";
import { startCardPayment } from "@/server/billing/card";

export const runtime = "nodejs";

const STATUS: Record<string, number> = { CARD_UNAVAILABLE: 503, ACCOUNT_RESTRICTED: 403, ACCOUNT_UNVERIFIED: 403, PLAN_NOT_FOUND: 404, GATEWAY_ERROR: 502 };
const schema = z.object({ planId: z.string().min(10).max(40) });

/** بدء الدفع بالبطاقة: يعيد رابط صفحة البوابة. التفعيل لا يحدث هنا، بل من إشعار البوابة الموقّع فقط. */
export async function POST(req: Request) {
  const g = await requireAuth();
  if ("res" in g) return g.res;
  const rl = await limit([[`card:${g.auth.user.id}`, 10, 3600]]);
  if (rl) return rl;
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const r = await startCardPayment(g.auth.user.id, b.data.planId);
  return r.ok ? Response.json({ data: { reference: r.reference, redirectUrl: r.redirectUrl } }) : fail(STATUS[r.code] ?? 400, r.code, "Card payment refused");
}

import { z } from "zod";
import { fail, ok } from "@/server/http";
import { limit, parseBody, requireAuth } from "@/server/auth/route";
import { cancelMyPendingRequest, requestCashSubscription } from "@/server/billing/service";

const schema = z.object({ planId: z.string().min(10).max(40), note: z.string().trim().max(500).optional() });
const CODES: Record<string, number> = { PLAN_NOT_FOUND: 404, EMAIL_NOT_VERIFIED: 403, ACCOUNT_RESTRICTED: 403, ALREADY_PENDING: 409 };

export async function POST(req: Request) {
  const g = await requireAuth();
  if ("res" in g) return g.res;
  const rl = await limit([[`cash:${g.auth.user.id}`, 10, 3600]]);
  if (rl) return rl;
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const r = await requestCashSubscription(g.auth.user.id, b.data.planId, b.data.note);
  return r.ok ? ok({ reference: r.reference }) : fail(CODES[r.code] ?? 400, r.code, "Request rejected");
}

/** إلغاء طلبي المعلّق */
export async function DELETE() {
  const g = await requireAuth();
  if ("res" in g) return g.res;
  const r = await cancelMyPendingRequest(g.auth.user.id);
  return r.ok ? ok({ cancelled: true }) : fail(404, r.code, "No pending request");
}

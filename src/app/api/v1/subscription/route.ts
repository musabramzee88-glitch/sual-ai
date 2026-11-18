import { ok } from "@/server/http";
import { requireAuth } from "@/server/auth/route";
import { getMySubscriptionState } from "@/server/billing/service";

export async function GET() {
  const g = await requireAuth();
  if ("res" in g) return g.res;
  return ok({ access: g.auth.access, ...(await getMySubscriptionState(g.auth.user.id)) });
}

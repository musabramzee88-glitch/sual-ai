import { ok } from "@/server/http";
import { requireAuth } from "@/server/auth/route";

export async function GET() {
  const g = await requireAuth();
  if ("res" in g) return g.res;
  return ok({ user: g.auth.user, access: g.auth.access });
}

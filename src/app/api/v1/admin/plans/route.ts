import { ok } from "@/server/http";
import { adminMutation, adminRead, respond } from "@/server/admin/route";
import { createPlan, listPlans, planSchema } from "@/server/admin/service";

export async function GET() {
  return adminRead("MANAGE_PLANS", async () => ok(await listPlans()));
}
export async function POST(req: Request) {
  return adminMutation(req, "MANAGE_PLANS", planSchema, async ({ actor, body }) => {
    const r = await createPlan(actor, body);
    return respond(r, r.ok ? r.plan : undefined);
  });
}

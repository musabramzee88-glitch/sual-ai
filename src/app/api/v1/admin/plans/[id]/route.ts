import { adminMutation, respond } from "@/server/admin/route";
import { planUpdateSchema, updatePlan } from "@/server/admin/service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminMutation(req, "MANAGE_PLANS", planUpdateSchema, async ({ actor, body }) => {
    const r = await updatePlan(actor, id, body);
    return respond(r, r.ok ? r.plan : undefined);
  });
}

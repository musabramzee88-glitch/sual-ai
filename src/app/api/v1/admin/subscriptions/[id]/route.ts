import { adminMutation, respond } from "@/server/admin/route";
import { applySubscriptionAction, subscriptionActionSchema } from "@/server/admin/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminMutation(req, "MANAGE_SUBSCRIPTIONS", subscriptionActionSchema, async ({ actor, body }) => respond(await applySubscriptionAction(actor, id, body)));
}

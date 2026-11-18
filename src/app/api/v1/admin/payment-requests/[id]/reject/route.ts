import { z } from "zod";
import { adminMutation, respond } from "@/server/admin/route";
import { rejectCashRequest } from "@/server/billing/service";

const schema = z.object({ note: z.string().trim().min(3).max(500) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminMutation(req, "APPROVE_PAYMENTS", schema, async ({ actor, body }) => respond(await rejectCashRequest(actor, id, body.note)));
}

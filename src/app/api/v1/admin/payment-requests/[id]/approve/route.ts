import { z } from "zod";
import { adminMutation, respond } from "@/server/admin/route";
import { approveCashRequest } from "@/server/billing/service";

const schema = z.object({ note: z.string().trim().max(500).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminMutation(req, "APPROVE_PAYMENTS", schema, async ({ actor, body }) => {
    const r = await approveCashRequest(actor, id, body.note);
    return respond(r, r.ok ? { endsAt: r.endsAt } : undefined);
  });
}

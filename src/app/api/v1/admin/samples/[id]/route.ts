import { actorOf, requireAdmin } from "@/server/admin/guard";
import { adminMutation, respond } from "@/server/admin/route";
import { deleteSample, sampleUpdateSchema, updateSample } from "@/server/exams/samples";

export const runtime = "nodejs";

/** تصحيح النص المنسوخ، العنوان، أو التفعيل */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminMutation(req, "MANAGE_CURRICULUM", sampleUpdateSchema, async ({ actor, body }) => respond(await updateSample(actor, id, body)));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin("MANAGE_CURRICULUM");
  if ("res" in g) return g.res;
  return respond(await deleteSample(actorOf(g.admin, req), (await params).id));
}

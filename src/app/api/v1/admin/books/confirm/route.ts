import { ok } from "@/server/http";
import { adminMutation } from "@/server/admin/route";
import { confirmPlacements, confirmSchema } from "@/server/books/bulk";

export const runtime = "nodejs";

/** تأكيد مكان الكتب بعد مراجعتها (مع التصحيح إن لزم): ينشئ المنهج المناسب ويربط الكتاب به */
export async function POST(req: Request) {
  return adminMutation(req, "MANAGE_CURRICULUM", confirmSchema, async ({ actor, body }) => ok({ results: await confirmPlacements(actor, body) }));
}

import { ok } from "@/server/http";
import { adminMutation, respond } from "@/server/admin/route";
import { applyLinks, applySchema } from "@/server/books/bulk";

export const runtime = "nodejs";

/** إنشاء المناهج المناسبة وربط الكتب بها دفعة واحدة (بعد مراجعة المستخدم) */
export async function POST(req: Request) {
  return adminMutation(req, "MANAGE_CURRICULUM", applySchema, async ({ actor, body }) => {
    const r = await applyLinks(actor, body);
    return r.ok ? ok({ results: r.results }) : respond(r);
  });
}

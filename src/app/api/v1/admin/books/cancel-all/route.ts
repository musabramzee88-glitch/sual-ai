import { z } from "zod";
import { ok } from "@/server/http";
import { adminMutation } from "@/server/admin/route";
import { cancelProcessing } from "@/server/books/service";

export const runtime = "nodejs";

/** يوقف معالجة كل كتب المكتبة الجارية أو المنتظرة */
export async function POST(req: Request) {
  return adminMutation(req, "MANAGE_CURRICULUM", z.object({}), async ({ actor }) => ok(await cancelProcessing(actor)));
}

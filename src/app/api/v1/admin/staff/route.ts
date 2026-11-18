import { fail, ok } from "@/server/http";
import { adminMutation, adminRead, respond } from "@/server/admin/route";
import { addStaff, listStaff, staffSchema } from "@/server/admin/service";

export async function GET() {
  return adminRead("MANAGE_STAFF", async () => ok(await listStaff()));
}
/** إضافة موظف: للمدير الرئيسي فقط */
export async function POST(req: Request) {
  return adminMutation(req, "MANAGE_STAFF", staffSchema, async ({ admin, actor, body }) =>
    admin.isSuper ? respond(await addStaff(actor, body)) : fail(403, "FORBIDDEN", "Super admin only"));
}

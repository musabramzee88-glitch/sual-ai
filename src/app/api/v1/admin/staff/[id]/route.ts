import { fail } from "@/server/http";
import { adminMutation, respond } from "@/server/admin/route";
import { staffUpdateSchema, updateStaff } from "@/server/admin/service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminMutation(req, "MANAGE_STAFF", staffUpdateSchema, async ({ admin, actor, body }) =>
    admin.isSuper ? respond(await updateStaff({ ...actor, userId: admin.auth.user.id }, id, body)) : fail(403, "FORBIDDEN", "Super admin only"));
}

import { z } from "zod";
import { adminMutation, respond } from "@/server/admin/route";
import { setUserStatus } from "@/server/admin/service";

const schema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminMutation(req, "MANAGE_USERS", schema, async ({ admin, actor, body }) => {
    const r = await setUserStatus({ ...actor, userId: admin.auth.user.id, isSuper: admin.isSuper }, id, body.status);
    return respond(r, r.ok ? { status: r.status } : undefined);
  });
}

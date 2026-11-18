import { ok } from "@/server/http";
import { adminMutation, adminRead, respond } from "@/server/admin/route";
import { listMessages, messageSchema, upsertMessage } from "@/server/admin/service";

export async function GET() {
  return adminRead("MANAGE_SYSTEM_MESSAGES", async () => ok(await listMessages()));
}
export async function PUT(req: Request) {
  return adminMutation(req, "MANAGE_SYSTEM_MESSAGES", messageSchema, async ({ actor, body }) => respond(await upsertMessage(actor, body)));
}

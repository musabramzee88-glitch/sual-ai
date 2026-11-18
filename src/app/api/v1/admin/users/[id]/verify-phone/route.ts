import { z } from "zod";
import { adminMutation, respond } from "@/server/admin/route";
import { manualVerifyPhone } from "@/server/admin/service";

const schema = z.object({ reason: z.string().trim().min(5).max(300) });

/** تأكيد يدوي للهاتف (استثنائي، مسجَّل بالتدقيق) — قبل توفر SMS. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminMutation(req, "MANAGE_USERS", schema, async ({ actor, body }) => respond(await manualVerifyPhone(actor, id, body.reason)));
}

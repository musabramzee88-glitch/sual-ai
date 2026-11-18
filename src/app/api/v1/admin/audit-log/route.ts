import { ok } from "@/server/http";
import { adminRead } from "@/server/admin/route";
import { listAudit } from "@/server/admin/service";

export async function GET(req: Request) {
  return adminRead("VIEW_AUDIT_LOG", async () => ok(await listAudit(Number(new URL(req.url).searchParams.get("page")) || 1)));
}

import { ok } from "@/server/http";
import { adminRead } from "@/server/admin/route";
import { listSubscriptions } from "@/server/admin/service";

export async function GET(req: Request) {
  return adminRead("MANAGE_SUBSCRIPTIONS", async () => {
    const u = new URL(req.url).searchParams;
    return ok(await listSubscriptions({ status: u.get("status") ?? undefined, page: Number(u.get("page")) || 1 }));
  });
}

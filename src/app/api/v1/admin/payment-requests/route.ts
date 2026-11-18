import { ok } from "@/server/http";
import { adminRead } from "@/server/admin/route";
import { listPaymentRequests } from "@/server/admin/service";

export async function GET(req: Request) {
  return adminRead("APPROVE_PAYMENTS", async () => ok(await listPaymentRequests(new URL(req.url).searchParams.get("status") ?? undefined)));
}

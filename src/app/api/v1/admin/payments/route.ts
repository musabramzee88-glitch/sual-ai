import { ok } from "@/server/http";
import { adminRead } from "@/server/admin/route";
import { listPayments } from "@/server/admin/service";

export async function GET(req: Request) {
  return adminRead("APPROVE_PAYMENTS", async () => ok(await listPayments(Number(new URL(req.url).searchParams.get("page")) || 1)));
}

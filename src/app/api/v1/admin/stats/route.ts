import { ok } from "@/server/http";
import { adminRead } from "@/server/admin/route";
import { getStats } from "@/server/admin/service";

export async function GET() {
  return adminRead("VIEW_DASHBOARD", async () => ok(await getStats()));
}

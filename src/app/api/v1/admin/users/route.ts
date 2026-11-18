import { ok } from "@/server/http";
import { adminRead } from "@/server/admin/route";
import { listUsers } from "@/server/admin/service";

export async function GET(req: Request) {
  return adminRead("MANAGE_USERS", async () => {
    const u = new URL(req.url).searchParams;
    return ok(await listUsers({ q: u.get("q") ?? undefined, status: u.get("status") ?? undefined, page: Number(u.get("page")) || 1 }));
  });
}

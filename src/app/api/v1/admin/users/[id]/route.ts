import { fail, ok } from "@/server/http";
import { adminRead } from "@/server/admin/route";
import { getUserDetail } from "@/server/admin/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminRead("MANAGE_USERS", async () => {
    const u = await getUserDetail(id);
    return u ? ok(u) : fail(404, "NOT_FOUND", "User not found");
  });
}

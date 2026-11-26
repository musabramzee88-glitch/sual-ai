import { z } from "zod";
import { cookies } from "next/headers";
import { fail, ok } from "@/server/http";
import { limit, parseBody, requireAuth } from "@/server/auth/route";
import { deleteAccount } from "@/server/auth/account";
import { SESSION_COOKIE, DEVICE_COOKIE } from "@/server/auth/session";

const schema = z.object({ password: z.string().min(1).max(128), confirm: z.literal("DELETE") });

/** حذف الحساب نهائياً بطلب صاحبه (كلمة المرور + تأكيد صريح). */
export async function POST(req: Request) {
  const g = await requireAuth();
  if ("res" in g) return g.res;
  const rl = await limit([[`acctdel:${g.auth.user.id}`, 5, 3600]]);
  if (rl) return rl;
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const r = await deleteAccount(g.auth.user.id, b.data.password);
  if (!r.ok) return fail(r.code === "INVALID_PASSWORD" ? 403 : r.code === "ADMIN_ACCOUNT" ? 409 : 404, r.code, "Account deletion failed");
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(DEVICE_COOKIE);
  return ok({ deleted: true });
}

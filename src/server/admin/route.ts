import "server-only";
import type { AdminPermission } from "@prisma/client";
import type { z } from "zod";
import { fail, ok } from "../http";
import { limit, parseBody } from "../auth/route";
import { actorOf, requireAdmin, type AdminContext } from "./guard";
import type { Actor } from "./audit";

const STATUS: Record<string, number> = {
  NOT_FOUND: 404, USER_NOT_FOUND: 404, CHAPTER_NOT_FOUND: 404, FORBIDDEN: 403, CANNOT_MODIFY_SELF: 403, INVALID_DATE: 400, VALIDATION_ERROR: 400,
};

/** يحوّل نتيجة خدمة {ok:true,...}|{ok:false,code} إلى استجابة HTTP موحّدة. */
export function respond(r: { ok: true } | { ok: false; code: string }, data?: unknown) {
  if (r.ok) return ok(data ?? { done: true });
  return fail(STATUS[r.code] ?? 409, r.code, "Operation rejected");
}

type Ctx<B> = { admin: AdminContext; actor: Actor; body: B };

/** غلاف مسارات الإدارة: صلاحية + حد معدّل + تحقق Zod (للطرق المغيِّرة). */
export async function adminMutation<S extends z.ZodTypeAny>(
  req: Request, perm: AdminPermission, schema: S, fn: (c: Ctx<z.infer<S>>) => Promise<Response>,
): Promise<Response> {
  const g = await requireAdmin(perm);
  if ("res" in g) return g.res;
  const rl = await limit([[`admin:${g.admin.adminId}`, 120, 60]]);
  if (rl) return rl;
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  return fn({ admin: g.admin, actor: actorOf(g.admin, req), body: b.data });
}

export async function adminRead(perm: AdminPermission, fn: (admin: AdminContext) => Promise<Response>): Promise<Response> {
  const g = await requireAdmin(perm);
  return "res" in g ? g.res : fn(g.admin);
}

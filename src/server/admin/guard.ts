import "server-only";
import { redirect } from "next/navigation";
import { AdminPermission } from "@prisma/client";
import { db } from "../db";
import { fail } from "../http";
import { getAuth, type AuthContext } from "../auth/session";
import { clientIp } from "../auth/ratelimit";
import type { Actor } from "./audit";

export const ALL_PERMISSIONS = Object.values(AdminPermission);

export type AdminContext = { auth: AuthContext; adminId: string; permissions: Set<AdminPermission>; isSuper: boolean };

/** يحدّد صلاحيات الإداري من قاعدة البيانات (لا من الواجهة). SUPER_ADMIN يملك كل الصلاحيات. */
export async function loadAdmin(auth: AuthContext | null): Promise<AdminContext | null> {
  if (!auth || auth.access === "ACCOUNT_SUSPENDED" || auth.access === "BANNED") return null;
  if (auth.user.role !== "ADMIN_STAFF" && auth.user.role !== "SUPER_ADMIN") return null;
  const row = await db.adminUser.findUnique({ where: { userId: auth.user.id } });
  if (!row || !row.isActive) return null;
  const isSuper = auth.user.role === "SUPER_ADMIN";
  return { auth, adminId: row.id, isSuper, permissions: new Set(isSuper ? ALL_PERMISSIONS : row.permissions) };
}

export const can = (a: AdminContext, p: AdminPermission) => a.permissions.has(p);

/** حارس API الإدارة */
export async function requireAdmin(perm: AdminPermission): Promise<{ admin: AdminContext } | { res: Response }> {
  const auth = await getAuth();
  if (!auth) return { res: fail(401, "UNAUTHENTICATED", "Authentication required") };
  const admin = await loadAdmin(auth);
  if (!admin) return { res: fail(403, "FORBIDDEN", "Admin access required") };
  if (!can(admin, perm)) return { res: fail(403, "FORBIDDEN", "Missing permission") };
  return { admin };
}

/** حارس صفحات الإدارة (يُعيد التوجيه) */
export async function requireAdminPage(perm: AdminPermission): Promise<AdminContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const admin = await loadAdmin(auth);
  if (!admin || !can(admin, perm)) redirect("/dashboard");
  return admin;
}

export const actorOf = (admin: AdminContext, req: Request): Actor => ({
  adminId: admin.adminId,
  ip: clientIp(req),
  userAgent: req.headers.get("user-agent"),
});

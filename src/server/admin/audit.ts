import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";

export type Tx = Prisma.TransactionClient | PrismaClient;
export type Actor = { adminId: string; ip?: string; userAgent?: string | null };

/** سجل تدقيق — يُكتب داخل نفس المعاملة التي تنفّذ الإجراء. لا يحوي أسراراً. */
export function audit(
  tx: Tx,
  a: Actor,
  entry: { action: string; targetType: string; targetId?: string; before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue },
) {
  return tx.adminAuditLog.create({
    data: {
      adminUserId: a.adminId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: entry.before,
      after: entry.after,
      ip: a.ip,
      userAgent: a.userAgent?.slice(0, 255),
    },
  });
}

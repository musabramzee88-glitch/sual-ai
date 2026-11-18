import "server-only";
import { z } from "zod";
import { AdminPermission, Prisma } from "@prisma/client";
import { db } from "../db";
import { codeSchema } from "../http";
import { revokeAllSessions } from "../auth/session";
import { audit, type Actor } from "./audit";

type Fail<C extends string> = { ok: false; code: C };
const fail = <C extends string>(code: C): Fail<C> => ({ ok: false, code });
const DAY = 86_400_000;
export const PAGE_SIZE = 25;

// ───────────────────────── الباقات ─────────────────────────
export const planSchema = z.object({
  code: codeSchema,
  nameAr: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().min(2).max(80),
  durationDays: z.number().int().min(1).max(3660),
  priceIqd: z.number().int().min(0).max(1_000_000_000),
  examQuota: z.number().int().min(1).max(1_000_000).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export const planUpdateSchema = planSchema.omit({ code: true }).partial();

export const listPlans = () => db.subscriptionPlan.findMany({ orderBy: [{ sortOrder: "asc" }, { priceIqd: "asc" }] });

export async function createPlan(actor: Actor, input: z.infer<typeof planSchema>) {
  try {
    return await db.$transaction(async (tx) => {
      const p = await tx.subscriptionPlan.create({ data: { ...input, examQuota: input.examQuota ?? null } });
      await audit(tx, actor, { action: "plan.create", targetType: "SubscriptionPlan", targetId: p.id, after: input });
      return { ok: true as const, plan: p };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("CODE_TAKEN");
    throw e;
  }
}

/** تعديل الأسعار لا يمس الاشتراكات/الطلبات القائمة (المبلغ مخزّن في الطلب نفسه). */
export async function updatePlan(actor: Actor, id: string, input: z.infer<typeof planUpdateSchema>) {
  return db.$transaction(async (tx) => {
    const before = await tx.subscriptionPlan.findUnique({ where: { id } });
    if (!before) return fail("NOT_FOUND");
    const p = await tx.subscriptionPlan.update({ where: { id }, data: input });
    await audit(tx, actor, { action: "plan.update", targetType: "SubscriptionPlan", targetId: id, before: { ...before }, after: input });
    return { ok: true as const, plan: p };
  });
}

// ───────────────────────── المستخدمون ─────────────────────────
export async function listUsers(opts: { q?: string; status?: string; page?: number }) {
  const where: Prisma.UserWhereInput = { role: "TEACHER" };
  if (opts.status && ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "BANNED"].includes(opts.status)) where.status = opts.status as never;
  const q = opts.q?.trim();
  if (q) where.OR = [{ fullName: { contains: q, mode: "insensitive" } }, { email: { contains: q.toLowerCase() } }, { phone: { contains: q.replace(/\s/g, "") } }];
  const page = Math.max(1, opts.page ?? 1);
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, fullName: true, email: true, phone: true, status: true, emailVerifiedAt: true, phoneVerifiedAt: true, createdAt: true, subscriptions: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, endsAt: true } } },
    }),
    db.user.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export const getUserDetail = (id: string) =>
  db.user.findUnique({
    where: { id },
    select: {
      id: true, fullName: true, email: true, phone: true, role: true, status: true, emailVerifiedAt: true, phoneVerifiedAt: true, lastLoginAt: true, createdAt: true,
      teacherProfile: { select: { specialization: true, directorate: { select: { nameAr: true, governorate: { select: { nameAr: true } } } }, schools: { select: { name: true, isPrimary: true } } } },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 20, include: { plan: { select: { nameAr: true, nameEn: true } } } },
      transactions: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, reference: true, method: true, amountIqd: true, status: true, createdAt: true } },
    },
  });

/** إيقاف/حظر/إعادة تفعيل. لا يمكن تغيير حسابك، ولا تعديل إداري إلا لـ SUPER_ADMIN. */
export async function setUserStatus(actor: Actor & { userId: string; isSuper: boolean }, targetId: string, status: "ACTIVE" | "SUSPENDED" | "BANNED") {
  if (targetId === actor.userId) return fail("CANNOT_MODIFY_SELF");
  return db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: targetId } });
    if (!u) return fail("NOT_FOUND");
    if (u.role !== "TEACHER" && !actor.isSuper) return fail("FORBIDDEN");
    // إعادة التفعيل: ACTIVE فقط إن اكتمل التحقق، وإلا يعود لانتظار التحقق
    const next = status === "ACTIVE" && !(u.emailVerifiedAt && u.phoneVerifiedAt) ? "PENDING_VERIFICATION" : status;
    await tx.user.update({ where: { id: targetId }, data: { status: next } });
    await audit(tx, actor, { action: `user.status.${status.toLowerCase()}`, targetType: "User", targetId, before: { status: u.status }, after: { status: next } });
    return { ok: true as const, status: next };
  }).then(async (r) => {
    if (r.ok && (status === "SUSPENDED" || status === "BANNED")) await revokeAllSessions(targetId);
    return r;
  });
}

/**
 * تأكيد الهاتف يدوياً من الإدارة (قبل توفر SMS في المرحلة 5). إجراء استثنائي مسجَّل بالتدقيق،
 * ولا يُعرض كأنه تحقق OTP.
 */
export async function manualVerifyPhone(actor: Actor, targetId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: targetId } });
    if (!u) return fail("NOT_FOUND");
    if (u.phoneVerifiedAt) return fail("ALREADY_VERIFIED");
    const now = new Date();
    await tx.user.update({ where: { id: targetId }, data: { phoneVerifiedAt: now } });
    await tx.user.updateMany({ where: { id: targetId, status: "PENDING_VERIFICATION", emailVerifiedAt: { not: null } }, data: { status: "ACTIVE" } });
    await audit(tx, actor, { action: "user.phone_verify_manual", targetType: "User", targetId, after: { reason, phone: u.phone } });
    return { ok: true as const };
  });
}

// ───────────────────────── الاشتراكات ─────────────────────────
export async function listSubscriptions(opts: { status?: string; page?: number }) {
  const where: Prisma.SubscriptionWhereInput = {};
  if (opts.status && ["PENDING_PAYMENT", "PENDING_APPROVAL", "ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED"].includes(opts.status)) where.status = opts.status as never;
  const page = Math.max(1, opts.page ?? 1);
  const [rows, total] = await Promise.all([
    db.subscription.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { user: { select: { id: true, fullName: true, email: true } }, plan: { select: { nameAr: true, nameEn: true } } } }),
    db.subscription.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export const subscriptionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("extend"), days: z.number().int().min(1).max(3660) }),
  z.object({ action: z.literal("set_end"), endsAt: z.coerce.date() }),
  z.object({ action: z.literal("suspend") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("cancel") }),
]);

/** تمديد/تحديد تاريخ الانتهاء/إيقاف/استئناف/إلغاء — كلها مسجّلة بالتدقيق. */
export async function applySubscriptionAction(actor: Actor, id: string, act: z.infer<typeof subscriptionActionSchema>, now = new Date()) {
  return db.$transaction(async (tx) => {
    const s = await tx.subscription.findUnique({ where: { id } });
    if (!s) return fail("NOT_FOUND");
    const before = { status: s.status, endsAt: s.endsAt?.toISOString() ?? null };
    let data: Prisma.SubscriptionUpdateInput;
    switch (act.action) {
      case "extend":
        if (s.status !== "ACTIVE" || !s.endsAt) return fail("NOT_ACTIVE");
        data = { endsAt: new Date(Math.max(s.endsAt.getTime(), now.getTime()) + act.days * DAY) };
        break;
      case "set_end":
        if (s.status !== "ACTIVE" || !s.startsAt) return fail("NOT_ACTIVE");
        if (act.endsAt <= s.startsAt) return fail("INVALID_DATE");
        data = { endsAt: act.endsAt };
        break;
      case "suspend":
        if (s.status !== "ACTIVE") return fail("NOT_ACTIVE");
        data = { status: "SUSPENDED" };
        break;
      case "resume":
        // استئناف الإيقاف مرفوض إن وُجد اشتراك فعال آخر (القيد: واحد فعال لكل مستخدم)
        if (s.status !== "SUSPENDED") return fail("NOT_SUSPENDED");
        if (await tx.subscription.findFirst({ where: { userId: s.userId, status: "ACTIVE" } })) return fail("ANOTHER_ACTIVE");
        data = { status: "ACTIVE" };
        break;
      case "cancel":
        if (!["ACTIVE", "SUSPENDED", "PENDING_PAYMENT", "PENDING_APPROVAL"].includes(s.status)) return fail("NOT_CANCELLABLE");
        data = { status: "CANCELLED", cancelledAt: now };
        break;
    }
    const upd = await tx.subscription.update({ where: { id }, data });
    // إلغاء اشتراك معلّق ينهي طلب الدفع المرتبط حتى لا يبقى معلّقاً بلا اشتراك
    if (act.action === "cancel" && s.status === "PENDING_APPROVAL") {
      await tx.paymentRequest.updateMany({ where: { subscriptionId: id, status: "PENDING_REVIEW" }, data: { status: "CANCELLED" } });
      await tx.paymentTransaction.updateMany({ where: { subscriptionId: id, status: "PENDING" }, data: { status: "CANCELLED" } });
    }
    await audit(tx, actor, { action: `subscription.${act.action}`, targetType: "Subscription", targetId: id, before, after: { status: upd.status, endsAt: upd.endsAt?.toISOString() ?? null } });
    return { ok: true as const };
  });
}

// ───────────────────────── الطلبات والمدفوعات ─────────────────────────
export const listPaymentRequests = (status?: string) =>
  db.paymentRequest.findMany({
    where: status && ["PENDING_REVIEW", "APPROVED", "REJECTED", "CANCELLED"].includes(status) ? { status: status as never } : {},
    orderBy: { createdAt: "desc" }, take: 100,
    include: { user: { select: { id: true, fullName: true, email: true, phone: true } }, plan: { select: { nameAr: true, nameEn: true, durationDays: true } }, reviewedBy: { select: { user: { select: { fullName: true } } } } },
  });

export const listPayments = (page = 1) =>
  db.paymentTransaction.findMany({
    orderBy: { createdAt: "desc" }, skip: (Math.max(1, page) - 1) * PAGE_SIZE, take: PAGE_SIZE,
    include: { user: { select: { id: true, fullName: true } }, approvedBy: { select: { user: { select: { fullName: true } } } } },
  });

// ───────────────────────── الإحصائيات ─────────────────────────
export async function getStats(now = new Date()) {
  const [teachers, activeAccounts, activeSubs, expiredSubs, pendingRequests, revenue, byDuration, exams] = await Promise.all([
    db.user.count({ where: { role: "TEACHER" } }),
    db.user.count({ where: { role: "TEACHER", status: "ACTIVE" } }),
    db.subscription.count({ where: { status: "ACTIVE", endsAt: { gt: now } } }),
    db.subscription.count({ where: { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", endsAt: { lte: now } }] } }),
    db.paymentRequest.count({ where: { status: "PENDING_REVIEW" } }),
    db.paymentTransaction.aggregate({ where: { status: "SUCCEEDED" }, _sum: { amountIqd: true } }),
    db.subscription.findMany({ where: { status: "ACTIVE", endsAt: { gt: now } }, select: { plan: { select: { code: true, nameAr: true, nameEn: true, durationDays: true } } } }),
    db.exam.count(),
  ]);
  const dist = new Map<string, { nameAr: string; nameEn: string; durationDays: number; count: number }>();
  for (const s of byDuration) {
    const e = dist.get(s.plan.code) ?? { nameAr: s.plan.nameAr, nameEn: s.plan.nameEn, durationDays: s.plan.durationDays, count: 0 };
    e.count++;
    dist.set(s.plan.code, e);
  }
  return { teachers, activeAccounts, activeSubs, expiredSubs, pendingRequests, revenueIqd: revenue._sum.amountIqd ?? 0, exams, distribution: [...dist.values()] };
}

// ───────────────────────── الموظفون والصلاحيات ─────────────────────────
export const staffSchema = z.object({ email: z.string().trim().email().transform((v) => v.toLowerCase()), permissions: z.array(z.nativeEnum(AdminPermission)).max(20) });
export const staffUpdateSchema = z.object({ permissions: z.array(z.nativeEnum(AdminPermission)).max(20).optional(), isActive: z.boolean().optional() });

export const listStaff = () =>
  db.adminUser.findMany({ orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, fullName: true, email: true, role: true } } } });

/** ترقية مستخدم موجود وموثّق البريد إلى موظف إداري. للمدير الرئيسي فقط (يُفرض في الـ API). */
export async function addStaff(actor: Actor, input: z.infer<typeof staffSchema>) {
  return db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { email: input.email } });
    if (!u || !u.emailVerifiedAt) return fail("USER_NOT_FOUND");
    if (u.role === "SUPER_ADMIN") return fail("ALREADY_ADMIN");
    if (await tx.adminUser.findUnique({ where: { userId: u.id } })) return fail("ALREADY_ADMIN");
    await tx.user.update({ where: { id: u.id }, data: { role: "ADMIN_STAFF" } });
    const a = await tx.adminUser.create({ data: { userId: u.id, permissions: input.permissions, createdById: actor.adminId } });
    await audit(tx, actor, { action: "staff.add", targetType: "AdminUser", targetId: a.id, after: { email: u.email, permissions: input.permissions } });
    return { ok: true as const };
  });
}

export async function updateStaff(actor: Actor & { userId: string }, id: string, input: z.infer<typeof staffUpdateSchema>) {
  return db.$transaction(async (tx) => {
    const a = await tx.adminUser.findUnique({ where: { id }, include: { user: true } });
    if (!a) return fail("NOT_FOUND");
    if (a.userId === actor.userId) return fail("CANNOT_MODIFY_SELF");
    if (a.user.role === "SUPER_ADMIN") return fail("FORBIDDEN");
    await tx.adminUser.update({ where: { id }, data: input });
    await audit(tx, actor, { action: "staff.update", targetType: "AdminUser", targetId: id, before: { permissions: a.permissions, isActive: a.isActive }, after: input });
    return { ok: true as const };
  });
}

// ───────────────────────── رسائل النظام ─────────────────────────
export const messageSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,64}$/),
  locale: z.enum(["AR", "EN"]),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4000),
  isActive: z.boolean().optional(),
});
export const listMessages = () => db.systemMessage.findMany({ orderBy: [{ key: "asc" }, { locale: "asc" }] });
export const getMessage = (key: string, locale: "AR" | "EN") =>
  db.systemMessage.findFirst({ where: { key, locale, isActive: true } });

export async function upsertMessage(actor: Actor, input: z.infer<typeof messageSchema>) {
  return db.$transaction(async (tx) => {
    const before = await tx.systemMessage.findUnique({ where: { key_locale: { key: input.key, locale: input.locale } } });
    const m = await tx.systemMessage.upsert({
      where: { key_locale: { key: input.key, locale: input.locale } },
      create: { ...input, isActive: input.isActive ?? true },
      update: { title: input.title, body: input.body, ...(input.isActive === undefined ? {} : { isActive: input.isActive }) },
    });
    await audit(tx, actor, { action: "system_message.upsert", targetType: "SystemMessage", targetId: m.id, before: before ? { title: before.title, body: before.body } : undefined, after: { key: input.key, locale: input.locale, title: input.title } });
    return { ok: true as const };
  });
}

// ───────────────────────── سجل التدقيق ─────────────────────────
export const listAudit = (page = 1) =>
  db.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" }, skip: (Math.max(1, page) - 1) * PAGE_SIZE, take: PAGE_SIZE,
    include: { adminUser: { select: { user: { select: { fullName: true } } } } },
  });

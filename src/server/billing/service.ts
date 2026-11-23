import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit, type Actor } from "../admin/audit";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newReference = (prefix: string) =>
  `${prefix}-${Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

type Fail<C extends string> = { ok: false; code: C };
const fail = <C extends string>(code: C): Fail<C> => ({ ok: false, code });

export const listActivePlans = () =>
  db.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { priceIqd: "asc" }] });

/** حالة اشتراك المدرس الحالية (للصفحة): الاشتراك الفعال/الأحدث والطلب المعلّق */
export async function getMySubscriptionState(userId: string) {
  const [subs, pending] = await Promise.all([
    db.subscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, include: { plan: true } }),
    db.paymentRequest.findFirst({ where: { userId, status: "PENDING_REVIEW" }, include: { plan: true } }),
  ]);
  const current = subs.find((s) => s.status === "ACTIVE") ?? subs[0] ?? null;
  return { current, pending };
}

/** طلب تفعيل اشتراك بالدفع النقدي → «بانتظار تأكيد الإدارة». لا تفعيل تلقائي. */
export async function requestCashSubscription(userId: string, planId: string, userNote?: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status === "BANNED" || user.status === "SUSPENDED") return fail("ACCOUNT_RESTRICTED");
  if (!user.emailVerifiedAt && !user.phoneVerifiedAt) return fail("ACCOUNT_UNVERIFIED");
  const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) return fail("PLAN_NOT_FOUND");

  try {
    return await db.$transaction(async (tx) => {
      const sub = await tx.subscription.create({ data: { userId, planId, status: "PENDING_APPROVAL", paymentMethod: "CASH" } });
      const reference = newReference("SUAL");
      const request = await tx.paymentRequest.create({
        data: { reference, userId, planId, amountIqd: plan.priceIqd, userNote: userNote?.slice(0, 500), subscriptionId: sub.id },
      });
      await tx.paymentTransaction.create({
        data: { reference: newReference("TX"), userId, planId, method: "CASH", amountIqd: plan.priceIqd, status: "PENDING", paymentRequestId: request.id, subscriptionId: sub.id },
      });
      return { ok: true as const, reference, requestId: request.id };
    });
  } catch (e) {
    // الفهرس الجزئي: طلب نقدي معلّق واحد لكل مستخدم
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("ALREADY_PENDING");
    throw e;
  }
}

export async function cancelMyPendingRequest(userId: string) {
  return db.$transaction(async (tx) => {
    const req = await tx.paymentRequest.findFirst({ where: { userId, status: "PENDING_REVIEW" } });
    if (!req) return fail("NO_PENDING_REQUEST");
    const claimed = await tx.paymentRequest.updateMany({ where: { id: req.id, status: "PENDING_REVIEW" }, data: { status: "CANCELLED" } });
    if (claimed.count !== 1) return fail("NO_PENDING_REQUEST");
    if (req.subscriptionId) await tx.subscription.updateMany({ where: { id: req.subscriptionId, status: "PENDING_APPROVAL" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await tx.paymentTransaction.updateMany({ where: { paymentRequestId: req.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    return { ok: true as const };
  });
}

const DAY = 86_400_000;

/**
 * تفعيل اشتراك (مشترك بين موافقة الدفع النقدي ونجاح الدفع بالبطاقة) داخل معاملة المستدعي.
 * التجديد: إن وُجد اشتراك فعال لم ينتهِ تبدأ المدة الجديدة من نهايته ويُغلق القديم (الفهرس يسمح باشتراك فعال واحد).
 */
export async function activateSubscription(
  tx: Prisma.TransactionClient,
  o: { subscriptionId: string; userId: string; durationDays: number; now: Date; method: "CASH" | "CARD"; activatedById: string | null; reference: string },
) {
  const old = await tx.subscription.findFirst({ where: { userId: o.userId, status: "ACTIVE", NOT: { id: o.subscriptionId } } });
  const base = old?.endsAt && old.endsAt > o.now ? old.endsAt : o.now;
  if (old) await tx.subscription.update({ where: { id: old.id }, data: { status: "EXPIRED", notes: `Superseded by renewal ${o.reference}` } });
  const endsAt = new Date(base.getTime() + o.durationDays * DAY);
  await tx.subscription.update({
    where: { id: o.subscriptionId },
    data: { status: "ACTIVE", startsAt: o.now, endsAt, activatedAt: o.now, activatedById: o.activatedById, paymentMethod: o.method },
  });
  return endsAt;
}

/**
 * موافقة الإدارة على الدفع النقدي. ذرّية وغير قابلة للتكرار: تُحجز الحالة PENDING_REVIEW→APPROVED أولاً.
 * التجديد: إن وُجد اشتراك فعال لم ينتهِ تبدأ المدة الجديدة من نهايته (لا يخسر المدرس أياماً)
 * ويُغلق القديم (EXPIRED) لأن القيد يسمح باشتراك فعال واحد فقط.
 */
export async function approveCashRequest(actor: Actor, requestId: string, note?: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const claimed = await tx.paymentRequest.updateMany({
      where: { id: requestId, status: "PENDING_REVIEW" },
      data: { status: "APPROVED", reviewedById: actor.adminId, reviewedAt: now, reviewNote: note?.slice(0, 500) },
    });
    if (claimed.count !== 1) return fail("NOT_PENDING");
    const req = await tx.paymentRequest.findUniqueOrThrow({ where: { id: requestId }, include: { plan: true } });
    if (!req.subscriptionId) throw new Error("Payment request without subscription");

    const endsAt = await activateSubscription(tx, { subscriptionId: req.subscriptionId, userId: req.userId, durationDays: req.plan.durationDays, now, method: "CASH", activatedById: actor.adminId, reference: req.reference });
    await tx.paymentTransaction.updateMany({
      where: { paymentRequestId: requestId },
      data: { status: "SUCCEEDED", approvedById: actor.adminId, approvedAt: now, paidAt: now },
    });
    await audit(tx, actor, {
      action: "payment_request.approve", targetType: "PaymentRequest", targetId: requestId,
      before: { status: "PENDING_REVIEW" }, after: { status: "APPROVED", subscriptionId: req.subscriptionId, endsAt: endsAt.toISOString(), amountIqd: req.amountIqd },
    });
    return { ok: true as const, endsAt };
  });
}

export async function rejectCashRequest(actor: Actor, requestId: string, note: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const claimed = await tx.paymentRequest.updateMany({
      where: { id: requestId, status: "PENDING_REVIEW" },
      data: { status: "REJECTED", reviewedById: actor.adminId, reviewedAt: now, reviewNote: note.slice(0, 500) },
    });
    if (claimed.count !== 1) return fail("NOT_PENDING");
    const req = await tx.paymentRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (req.subscriptionId) await tx.subscription.updateMany({ where: { id: req.subscriptionId, status: "PENDING_APPROVAL" }, data: { status: "CANCELLED", cancelledAt: now } });
    await tx.paymentTransaction.updateMany({ where: { paymentRequestId: requestId }, data: { status: "FAILED", failureReason: note.slice(0, 500) } });
    await audit(tx, actor, { action: "payment_request.reject", targetType: "PaymentRequest", targetId: requestId, before: { status: "PENDING_REVIEW" }, after: { status: "REJECTED", note } });
    return { ok: true as const };
  });
}

import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { activateSubscription, newReference } from "./service";
import { gateway, signPayload, SIGNATURE_HEADER } from "./gateway";

/**
 * الدفع بالبطاقة: بدء الدفع → تحويل لصفحة البوابة → إشعار موقّع من البوابة (webhook) يفعّل الاشتراك.
 * - التفعيل لا يتم أبداً من صفحة العودة (يمكن تزويرها)؛ فقط من إشعار موقّع تحقّقنا منه.
 * - كل إشعار يُسجَّل مرة واحدة (فرادة provider+eventId) فإعادة الإرسال لا تكرر التفعيل، والعملية تُحجز بـ updateMany شرطي.
 * - المبلغ في الإشعار يجب أن يطابق مبلغ العملية.
 * - لا تُخزَّن بيانات بطاقة إطلاقاً (البوابة تستلمها مباشرة).
 */
const fail = <C extends string>(code: C) => ({ ok: false as const, code });

export const cardAvailable = () => gateway() !== null;
export const cardIsTest = () => gateway()?.test ?? false;

export async function startCardPayment(userId: string, planId: string) {
  const g = gateway();
  if (!g) return fail("CARD_UNAVAILABLE");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status === "BANNED" || user.status === "SUSPENDED") return fail("ACCOUNT_RESTRICTED");
  if (!user.emailVerifiedAt && !user.phoneVerifiedAt) return fail("ACCOUNT_UNVERIFIED");
  const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) return fail("PLAN_NOT_FOUND");

  const reference = newReference("CARD");
  const created = await db.$transaction(async (tx) => {
    // محاولة سابقة لم تكتمل تُلغى (لا تبقى اشتراكات معلّقة متراكمة)
    const stale = await tx.paymentTransaction.findMany({ where: { userId, method: "CARD", status: { in: ["INITIATED", "PENDING"] } }, select: { id: true, subscriptionId: true } });
    if (stale.length) {
      await tx.paymentTransaction.updateMany({ where: { id: { in: stale.map((s) => s.id) }, status: { in: ["INITIATED", "PENDING"] } }, data: { status: "CANCELLED", failureReason: "superseded" } });
      await tx.subscription.updateMany({ where: { id: { in: stale.map((s) => s.subscriptionId).filter((x): x is string => !!x) }, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    }
    const sub = await tx.subscription.create({ data: { userId, planId, status: "PENDING_PAYMENT", paymentMethod: "CARD" } });
    return tx.paymentTransaction.create({ data: { reference, userId, planId, method: "CARD", provider: g.name, amountIqd: plan.priceIqd, status: "INITIATED", subscriptionId: sub.id } });
  });
  try {
    const c = await g.createCheckout({
      reference, amountIqd: plan.priceIqd, description: plan.nameAr,
      returnUrl: `${env.APP_URL}/subscribe/return?ref=${encodeURIComponent(reference)}`,
      webhookUrl: `${env.APP_URL}/api/v1/payments/webhook/${g.name}`,
    });
    await db.paymentTransaction.update({ where: { id: created.id }, data: { providerTransactionId: c.providerTransactionId, status: "PENDING" } });
    return { ok: true as const, reference, redirectUrl: c.redirectUrl };
  } catch (e) {
    console.error(`[payments] checkout failed: ${(e as Error).message.split("\n")[0]}`);
    await db.$transaction([
      db.paymentTransaction.update({ where: { id: created.id }, data: { status: "FAILED", failureReason: "checkout_failed" } }),
      db.subscription.updateMany({ where: { id: created.subscriptionId!, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED", cancelledAt: new Date() } }),
    ]);
    return fail("GATEWAY_ERROR");
  }
}

export type WebhookOutcome = { status: number; result: "processed" | "duplicate" | "ignored" | "rejected"; detail?: string };

export async function handleWebhook(provider: string, raw: string, headers: Headers, now = new Date()): Promise<WebhookOutcome> {
  const g = gateway();
  if (!g || g.name !== provider) return { status: 404, result: "rejected", detail: "UNKNOWN_PROVIDER" };
  const payloadHash = createHash("sha256").update(raw).digest("hex");
  const v = g.verifyWebhook(raw, headers, Math.floor(now.getTime() / 1000));
  if (!v.ok) {
    // يُسجَّل الرفض (لكشف محاولات التزوير) دون معالجة؛ المفتاح من بصمة الجسم فلا يتكرر السطر
    await db.paymentWebhookEvent.create({ data: { provider, eventId: `invalid:${payloadHash.slice(0, 40)}`, eventType: "invalid", payloadHash, signatureOk: false, error: v.reason } }).catch(() => {});
    return { status: 401, result: "rejected", detail: v.reason };
  }
  const ev = v.event;
  let eventRow: { id: string };
  try {
    eventRow = await db.paymentWebhookEvent.create({ data: { provider, eventId: ev.eventId, eventType: ev.type, payloadHash, signatureOk: true } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { status: 200, result: "duplicate" };
    throw e;
  }

  const outcome = await db.$transaction(async (tx) => {
    const t = await tx.paymentTransaction.findUnique({ where: { provider_providerTransactionId: { provider, providerTransactionId: ev.providerTransactionId } }, include: { plan: true } });
    const done = (error: string | null, result: WebhookOutcome["result"]) =>
      tx.paymentWebhookEvent.update({ where: { id: eventRow.id }, data: { processedAt: now, transactionId: t?.id ?? null, error } }).then(() => ({ status: 200, result, detail: error ?? undefined }) as WebhookOutcome);
    if (!t) return done("UNKNOWN_TRANSACTION", "ignored");
    if (ev.status === "PENDING") return done(null, "ignored");
    if (ev.status === "FAILED") {
      await tx.paymentTransaction.updateMany({ where: { id: t.id, status: { in: ["INITIATED", "PENDING"] } }, data: { status: "FAILED", failureReason: ev.type.slice(0, 120) } });
      if (t.subscriptionId) await tx.subscription.updateMany({ where: { id: t.subscriptionId, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED", cancelledAt: now } });
      return done(null, "processed");
    }
    if (ev.amountIqd !== null && ev.amountIqd !== t.amountIqd) return done(`AMOUNT_MISMATCH ${ev.amountIqd} != ${t.amountIqd}`, "ignored");
    if (ev.currency !== null && ev.currency !== t.currency) return done(`CURRENCY_MISMATCH ${ev.currency}`, "ignored");
    // حجز العملية: نجاح واحد فقط مهما تكررت الإشعارات أو تزامنت
    const claimed = await tx.paymentTransaction.updateMany({ where: { id: t.id, status: { in: ["INITIATED", "PENDING"] } }, data: { status: "SUCCEEDED", paidAt: now } });
    if (claimed.count !== 1 || !t.subscriptionId) return done(claimed.count !== 1 ? "ALREADY_FINAL" : "NO_SUBSCRIPTION", "ignored");
    await activateSubscription(tx, { subscriptionId: t.subscriptionId, userId: t.userId, durationDays: t.plan.durationDays, now, method: "CARD", activatedById: null, reference: t.reference });
    return done(null, "processed");
  });
  return outcome;
}

/** حالة دفعة يملكها المستخدم (لصفحة العودة) */
export async function cardStatus(userId: string, reference: string) {
  const t = await db.paymentTransaction.findFirst({ where: { reference, userId, method: "CARD" }, include: { plan: true, subscription: true } });
  if (!t) return null;
  return { reference: t.reference, status: t.status, amountIqd: t.amountIqd, planAr: t.plan.nameAr, planEn: t.plan.nameEn, endsAt: t.subscription?.status === "ACTIVE" ? t.subscription.endsAt : null, provider: t.provider };
}

/**
 * البوابة التجريبية فقط: يحاكي ما ترسله البوابة بعد الدفع — يبني إشعاراً ويوقّعه بالسر نفسه ويمرّره على مسار التحقق ذاته
 * (لا طريق مختصر للتفعيل). مرفوض إن لم تكن البوابة الحالية تجريبية أو لم تكن الدفعة للمستخدم.
 */
export async function completeSandbox(userId: string, reference: string, outcome: "SUCCEEDED" | "FAILED") {
  const g = gateway();
  if (!g || g.name !== "sandbox" || !env.PAYMENT_WEBHOOK_SECRET) return fail("NOT_SANDBOX");
  const t = await db.paymentTransaction.findFirst({ where: { reference, userId, method: "CARD", provider: "sandbox" } });
  if (!t?.providerTransactionId) return fail("NOT_FOUND");
  const raw = JSON.stringify({ id: `evt_${t.id}_${outcome}_${Date.now()}`, type: outcome === "SUCCEEDED" ? "payment.succeeded" : "payment.failed", data: { transactionId: t.providerTransactionId, status: outcome, amountIqd: t.amountIqd, currency: t.currency } });
  const headers = new Headers({ [SIGNATURE_HEADER]: signPayload(env.PAYMENT_WEBHOOK_SECRET, raw) });
  const r = await handleWebhook("sandbox", raw, headers);
  return r.status === 200 ? { ok: true as const, result: r.result } : fail("WEBHOOK_REJECTED");
}

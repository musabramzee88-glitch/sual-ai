import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { approveCashRequest, cancelMyPendingRequest, rejectCashRequest, requestCashSubscription } from "./service";
import { applySubscriptionAction, createPlan, manualVerifyPhone, setUserStatus, updatePlan } from "../admin/service";
import { loadAdmin } from "../admin/guard";
import { resolveAccess } from "@/lib/access";

const TAG = `bt${Date.now()}`;
let seq = 0;
let adminId = "";
let adminUserId = "";
let planId = "";

const actor = () => ({ adminId, ip: "1.1.1.1" });
async function mkUser(opts: { verified?: boolean } = { verified: true }) {
  seq++;
  const now = new Date();
  return db.user.create({
    data: {
      fullName: "مدرس اختبار", email: `${TAG}-${seq}@example.test`, phone: `+96478${String(Date.now() + seq).slice(-8)}`, passwordHash: "x",
      emailVerifiedAt: opts.verified === false ? null : now, phoneVerifiedAt: opts.verified === false ? null : now, status: opts.verified === false ? "PENDING_VERIFICATION" : "ACTIVE",
    },
  });
}
const accessOf = async (userId: string) => {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 10 } } });
  const sub = u.subscriptions.find((s) => s.status === "ACTIVE") ?? u.subscriptions[0];
  return resolveAccess({ status: u.status, emailVerifiedAt: u.emailVerifiedAt, phoneVerifiedAt: u.phoneVerifiedAt, subscription: sub ? { status: sub.status, endsAt: sub.endsAt } : null });
};

beforeEach(async () => {
  if (adminId) return;
  const a = await mkUser();
  adminUserId = a.id;
  await db.user.update({ where: { id: a.id }, data: { role: "SUPER_ADMIN" } });
  adminId = (await db.adminUser.create({ data: { userId: a.id, permissions: [] } })).id;
  const p = await createPlan(actor(), { code: `T_${TAG}`.toUpperCase().slice(0, 30), nameAr: "باقة اختبار", nameEn: "Test plan", durationDays: 30, priceIqd: 15000 });
  if (!p.ok) throw new Error("plan");
  planId = p.plan.id;
});
afterAll(async () => {
  await db.paymentTransaction.deleteMany({ where: { user: { email: { startsWith: TAG } } } });
  await db.paymentRequest.deleteMany({ where: { user: { email: { startsWith: TAG } } } });
  await db.subscription.deleteMany({ where: { user: { email: { startsWith: TAG } } } });
  await db.adminAuditLog.deleteMany({ where: { adminUserId: adminId } });
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await db.subscriptionPlan.deleteMany({ where: { code: { startsWith: "T_BT" } } });
  await db.$disconnect();
});

describe("cash payment flow", () => {
  it("request → pending approval → admin approves → active; cannot approve twice", async () => {
    const u = await mkUser();
    const r = await requestCashSubscription(u.id, planId, "دفعت للمندوب");
    expect(r.ok).toBe(true);
    expect(await accessOf(u.id)).toBe("AWAITING_APPROVAL");
    if (!r.ok) return;

    const a = await approveCashRequest(actor(), r.requestId);
    expect(a.ok).toBe(true);
    expect(await accessOf(u.id)).toBe("SUBSCRIPTION_ACTIVE");
    expect(await approveCashRequest(actor(), r.requestId)).toEqual({ ok: false, code: "NOT_PENDING" });

    const sub = await db.subscription.findFirstOrThrow({ where: { userId: u.id } });
    expect(sub.activatedById).toBe(adminId);
    expect(sub.endsAt!.getTime() - sub.startsAt!.getTime()).toBe(30 * 86_400_000);
    const tx = await db.paymentTransaction.findFirstOrThrow({ where: { userId: u.id } });
    expect(tx).toMatchObject({ status: "SUCCEEDED", amountIqd: 15000, approvedById: adminId });
    expect(await db.adminAuditLog.count({ where: { targetId: r.requestId, action: "payment_request.approve" } })).toBe(1);
  });

  it("allows only one pending request per user and one active subscription", async () => {
    const u = await mkUser();
    expect((await requestCashSubscription(u.id, planId)).ok).toBe(true);
    expect(await requestCashSubscription(u.id, planId)).toEqual({ ok: false, code: "ALREADY_PENDING" });
  });

  it("concurrent approvals activate exactly once", async () => {
    const u = await mkUser();
    const r = await requestCashSubscription(u.id, planId);
    if (!r.ok) throw new Error();
    const res = await Promise.all([approveCashRequest(actor(), r.requestId), approveCashRequest(actor(), r.requestId), approveCashRequest(actor(), r.requestId)]);
    expect(res.filter((x) => x.ok)).toHaveLength(1);
    expect(await db.subscription.count({ where: { userId: u.id, status: "ACTIVE" } })).toBe(1);
  });

  it("renewal keeps remaining days and supersedes the old active subscription", async () => {
    const u = await mkUser();
    const r1 = await requestCashSubscription(u.id, planId);
    if (!r1.ok) throw new Error();
    await approveCashRequest(actor(), r1.requestId);
    const first = await db.subscription.findFirstOrThrow({ where: { userId: u.id, status: "ACTIVE" } });

    const r2 = await requestCashSubscription(u.id, planId);
    if (!r2.ok) throw new Error();
    // طلب التجديد المعلّق لا يقطع الخدمة الحالية
    expect(await accessOf(u.id)).toBe("SUBSCRIPTION_ACTIVE");
    await approveCashRequest(actor(), r2.requestId);
    const active = await db.subscription.findMany({ where: { userId: u.id, status: "ACTIVE" } });
    expect(active).toHaveLength(1);
    expect(active[0].endsAt!.getTime()).toBe(first.endsAt!.getTime() + 30 * 86_400_000);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("EXPIRED");
  });

  it("reject returns the user to awaiting payment; user can cancel own pending request", async () => {
    const u = await mkUser();
    const r = await requestCashSubscription(u.id, planId);
    if (!r.ok) throw new Error();
    expect((await rejectCashRequest(actor(), r.requestId, "لم يصل المبلغ")).ok).toBe(true);
    expect(await accessOf(u.id)).toBe("AWAITING_PAYMENT");
    expect((await db.paymentTransaction.findFirstOrThrow({ where: { userId: u.id } })).status).toBe("FAILED");

    expect((await requestCashSubscription(u.id, planId)).ok).toBe(true);
    expect((await cancelMyPendingRequest(u.id)).ok).toBe(true);
    expect(await cancelMyPendingRequest(u.id)).toEqual({ ok: false, code: "NO_PENDING_REQUEST" });
  });

  it("refuses unverified e-mail, banned users and inactive plans", async () => {
    const un = await mkUser({ verified: false });
    expect(await requestCashSubscription(un.id, planId)).toEqual({ ok: false, code: "EMAIL_NOT_VERIFIED" });
    const b = await mkUser();
    await db.user.update({ where: { id: b.id }, data: { status: "BANNED" } });
    expect(await requestCashSubscription(b.id, planId)).toEqual({ ok: false, code: "ACCOUNT_RESTRICTED" });
    const ok = await mkUser();
    const p = await createPlan(actor(), { code: `T_BT_OFF${seq}`, nameAr: "معطّلة", nameEn: "Off", durationDays: 10, priceIqd: 1000, isActive: false });
    if (!p.ok) throw new Error();
    expect(await requestCashSubscription(ok.id, p.plan.id)).toEqual({ ok: false, code: "PLAN_NOT_FOUND" });
  });

  it("changing plan price does not alter an existing request amount", async () => {
    const u = await mkUser();
    const r = await requestCashSubscription(u.id, planId);
    if (!r.ok) throw new Error();
    await updatePlan(actor(), planId, { priceIqd: 99000 });
    expect((await db.paymentRequest.findUniqueOrThrow({ where: { id: r.requestId } })).amountIqd).toBe(15000);
    await updatePlan(actor(), planId, { priceIqd: 15000 });
  });
});

describe("admin actions", () => {
  it("subscription extend / suspend / resume / cancel, all audited", async () => {
    const u = await mkUser();
    const r = await requestCashSubscription(u.id, planId);
    if (!r.ok) throw new Error();
    await approveCashRequest(actor(), r.requestId);
    const s = await db.subscription.findFirstOrThrow({ where: { userId: u.id, status: "ACTIVE" } });

    expect((await applySubscriptionAction(actor(), s.id, { action: "extend", days: 10 })).ok).toBe(true);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: s.id } })).endsAt!.getTime()).toBe(s.endsAt!.getTime() + 10 * 86_400_000);
    expect(await applySubscriptionAction(actor(), s.id, { action: "set_end", endsAt: new Date(s.startsAt!.getTime() - 1000) })).toEqual({ ok: false, code: "INVALID_DATE" });

    await applySubscriptionAction(actor(), s.id, { action: "suspend" });
    expect(await accessOf(u.id)).toBe("SUBSCRIPTION_SUSPENDED");
    await applySubscriptionAction(actor(), s.id, { action: "resume" });
    expect(await accessOf(u.id)).toBe("SUBSCRIPTION_ACTIVE");
    await applySubscriptionAction(actor(), s.id, { action: "cancel" });
    expect(await accessOf(u.id)).toBe("AWAITING_PAYMENT");
    expect(await db.adminAuditLog.count({ where: { targetId: s.id } })).toBeGreaterThanOrEqual(4);
  });

  it("an expired ACTIVE subscription resolves to expired access", async () => {
    const u = await mkUser();
    const r = await requestCashSubscription(u.id, planId);
    if (!r.ok) throw new Error();
    await approveCashRequest(actor(), r.requestId);
    const s = await db.subscription.findFirstOrThrow({ where: { userId: u.id, status: "ACTIVE" } });
    await db.subscription.update({ where: { id: s.id }, data: { startsAt: new Date(Date.now() - 2 * 86_400_000), endsAt: new Date(Date.now() - 1000) } });
    expect(await accessOf(u.id)).toBe("SUBSCRIPTION_EXPIRED");
  });

  it("ban revokes sessions; cannot modify self or admins as staff", async () => {
    const u = await mkUser();
    await db.userSession.create({ data: { userId: u.id, tokenHash: `h-${TAG}-${seq}`, mfaPassed: true, expiresAt: new Date(Date.now() + 1e6) } });
    const a = { ...actor(), userId: adminUserId, isSuper: true };
    expect((await setUserStatus(a, u.id, "BANNED")).ok).toBe(true);
    expect((await db.userSession.findFirstOrThrow({ where: { userId: u.id } })).revokedAt).not.toBeNull();
    expect(await setUserStatus(a, adminUserId, "BANNED")).toEqual({ ok: false, code: "CANNOT_MODIFY_SELF" });
    expect(await setUserStatus({ ...a, isSuper: false }, adminUserId + "x", "BANNED")).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("manual phone verification activates the account and is audited", async () => {
    const u = await mkUser({ verified: false });
    await db.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } });
    expect((await manualVerifyPhone(actor(), u.id, "تحقق هاتفي مباشر")).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe("ACTIVE");
    expect(await manualVerifyPhone(actor(), u.id, "تحقق هاتفي مباشر")).toEqual({ ok: false, code: "ALREADY_VERIFIED" });
    expect(await db.adminAuditLog.count({ where: { targetId: u.id, action: "user.phone_verify_manual" } })).toBe(1);
  });
});

describe("admin guard", () => {
  const ctx = (userId: string, role: "TEACHER" | "ADMIN_STAFF" | "SUPER_ADMIN") => ({
    user: { id: userId, fullName: "x", email: "x", phone: "x", role, locale: "AR" as const, emailVerified: true, phoneVerified: true },
    access: "AWAITING_PAYMENT" as const,
  });
  it("rejects teachers, honours staff permissions and deactivation", async () => {
    const t = await mkUser();
    expect(await loadAdmin(ctx(t.id, "TEACHER"))).toBeNull();
    // موظف بدون سجل AdminUser مرفوض حتى لو دوره ADMIN_STAFF
    expect(await loadAdmin(ctx(t.id, "ADMIN_STAFF"))).toBeNull();

    const s = await mkUser();
    await db.user.update({ where: { id: s.id }, data: { role: "ADMIN_STAFF" } });
    const row = await db.adminUser.create({ data: { userId: s.id, permissions: ["VIEW_DASHBOARD"] } });
    const a = await loadAdmin(ctx(s.id, "ADMIN_STAFF"));
    expect(a?.permissions.has("VIEW_DASHBOARD")).toBe(true);
    expect(a?.permissions.has("APPROVE_PAYMENTS")).toBe(false);
    await db.adminUser.update({ where: { id: row.id }, data: { isActive: false } });
    expect(await loadAdmin(ctx(s.id, "ADMIN_STAFF"))).toBeNull();

    const sa = await loadAdmin(ctx(adminUserId, "SUPER_ADMIN"));
    expect(sa?.permissions.has("MANAGE_STAFF")).toBe(true);
  });
});

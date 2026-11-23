import { afterAll, beforeAll, describe, expect, it } from "vitest";

// البوابة التجريبية مفعّلة لهذا الملف فقط (env يُقرأ عند الاستيراد)
const SECRET = "test-webhook-secret-0123456789abcdef0123456789";
process.env.PAYMENT_PROVIDER = "sandbox";
process.env.PAYMENT_WEBHOOK_SECRET = SECRET;

const { db } = await import("../db");
const C = await import("./card");
const G = await import("./gateway");

const TAG = `cp${Date.now()}`;
let seq = 0, planId = "", userId = "", otherId = "";
const mkUser = async (verified = true) => {
  seq++;
  const now = new Date();
  return db.user.create({ data: { fullName: "مدرس", email: `${TAG}-${seq}@example.test`, phone: `+96479${String(Date.now() + seq).slice(-8)}`, passwordHash: "x", emailVerifiedAt: verified ? now : null, status: verified ? "ACTIVE" : "PENDING_VERIFICATION" } });
};
const body = (o: { id: string; tx: string; status: string; amount?: number | null; currency?: string }) =>
  JSON.stringify({ id: o.id, type: `payment.${o.status.toLowerCase()}`, data: { transactionId: o.tx, status: o.status, amountIqd: o.amount === undefined ? 25000 : o.amount, currency: o.currency ?? "IQD" } });
const signed = (raw: string, t?: number) => new Headers({ [G.SIGNATURE_HEADER]: G.signPayload(SECRET, raw, t) });
const txOf = (reference: string) => db.paymentTransaction.findUniqueOrThrow({ where: { reference }, include: { subscription: true } });

beforeAll(async () => {
  planId = (await db.subscriptionPlan.create({ data: { code: `C_${TAG}`.toUpperCase().slice(0, 30), nameAr: "باقة بطاقة", nameEn: "Card plan", durationDays: 30, priceIqd: 25000, isActive: true } })).id;
  userId = (await mkUser()).id;
  otherId = (await mkUser()).id;
});
afterAll(async () => {
  const users = { user: { email: { startsWith: TAG } } };
  await db.paymentWebhookEvent.deleteMany({ where: { OR: [{ transaction: users }, { provider: "sandbox", eventId: { startsWith: "evt_" } }, { provider: "sandbox", eventId: { startsWith: "invalid:" } }] } });
  await db.paymentTransaction.deleteMany({ where: users });
  await db.subscription.deleteMany({ where: users });
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await db.subscriptionPlan.deleteMany({ where: { id: planId } });
  await db.$disconnect();
});

describe("webhook signatures", () => {
  it("accepts a fresh valid signature; rejects a wrong secret, a tampered body, a stale timestamp, a missing header", () => {
    const raw = body({ id: "e1", tx: "t1", status: "SUCCEEDED" });
    const now = 1_800_000_000;
    expect(G.verifySignature(SECRET, raw, G.signPayload(SECRET, raw, now), now)).toEqual({ ok: true });
    expect(G.verifySignature(SECRET, raw, G.signPayload("another-secret-0123456789abcdef0123", raw, now), now)).toMatchObject({ ok: false, reason: "BAD_SIGNATURE" });
    expect(G.verifySignature(SECRET, raw.replace("25000", "100"), G.signPayload(SECRET, raw, now), now)).toMatchObject({ ok: false, reason: "BAD_SIGNATURE" });
    expect(G.verifySignature(SECRET, raw, G.signPayload(SECRET, raw, now - 600), now)).toMatchObject({ ok: false, reason: "STALE_SIGNATURE" });
    expect(G.verifySignature(SECRET, raw, null, now)).toMatchObject({ ok: false, reason: "MISSING_SIGNATURE" });
    expect(G.verifySignature(SECRET, raw, "t=1,v1=zz", now)).toMatchObject({ ok: false, reason: "BAD_SIGNATURE_FORMAT" });
  });
});

describe("card payment flow (sandbox gateway)", () => {
  it("start → signed success webhook activates the subscription once; the return page alone never activates", async () => {
    expect(C.cardAvailable()).toBe(true);
    expect(C.cardIsTest()).toBe(true);
    const s = await C.startCardPayment(userId, planId);
    if (!s.ok) throw new Error(s.code);
    expect(s.redirectUrl).toBe(`/subscribe/sandbox/${s.reference}`);
    let t = await txOf(s.reference);
    expect([t.status, t.subscription?.status, t.amountIqd]).toEqual(["PENDING", "PENDING_PAYMENT", 25000]);
    expect((await C.cardStatus(userId, s.reference))?.status).toBe("PENDING"); // صفحة العودة تقرأ فقط
    expect(await C.cardStatus(otherId, s.reference)).toBeNull();

    const raw = body({ id: `evt_ok_${TAG}`, tx: t.providerTransactionId!, status: "SUCCEEDED" });
    expect(await C.handleWebhook("sandbox", raw, signed(raw))).toMatchObject({ status: 200, result: "processed" });
    t = await txOf(s.reference);
    expect([t.status, t.subscription?.status, t.subscription?.paymentMethod]).toEqual(["SUCCEEDED", "ACTIVE", "CARD"]);
    const ends = t.subscription!.endsAt!.getTime();
    // الإشعار نفسه مرة ثانية: لا تفعيل مكرر ولا تمديد
    expect(await C.handleWebhook("sandbox", raw, signed(raw))).toMatchObject({ status: 200, result: "duplicate" });
    // إشعار نجاح آخر بمعرّف مختلف لنفس العملية: محجوزة، لا تمديد
    const raw2 = body({ id: `evt_ok2_${TAG}`, tx: t.providerTransactionId!, status: "SUCCEEDED" });
    expect(await C.handleWebhook("sandbox", raw2, signed(raw2))).toMatchObject({ status: 200, result: "ignored", detail: "ALREADY_FINAL" });
    expect((await txOf(s.reference)).subscription!.endsAt!.getTime()).toBe(ends);
  });

  it("forged or tampered webhooks are rejected and logged; nothing is activated", async () => {
    const s = await C.startCardPayment(otherId, planId);
    if (!s.ok) throw new Error(s.code);
    const t = await txOf(s.reference);
    const raw = body({ id: `evt_forged_${TAG}`, tx: t.providerTransactionId!, status: "SUCCEEDED" });
    const forged = new Headers({ [G.SIGNATURE_HEADER]: G.signPayload("attacker-secret-0123456789abcdef0123", raw) });
    expect(await C.handleWebhook("sandbox", raw, forged)).toMatchObject({ status: 401, result: "rejected", detail: "BAD_SIGNATURE" });
    expect(await C.handleWebhook("sandbox", raw, new Headers())).toMatchObject({ status: 401 });
    expect(await C.handleWebhook("stripe", raw, signed(raw))).toMatchObject({ status: 404 }); // بوابة غير مفعّلة
    expect((await txOf(s.reference)).status).toBe("PENDING");
    expect(await db.paymentWebhookEvent.count({ where: { provider: "sandbox", signatureOk: false } })).toBeGreaterThan(0);
  });

  it("a wrong amount or currency never activates; a failure cancels the pending subscription", async () => {
    const s = await C.startCardPayment(otherId, planId);
    if (!s.ok) throw new Error(s.code);
    const t = await txOf(s.reference);
    const cheap = body({ id: `evt_cheap_${TAG}`, tx: t.providerTransactionId!, status: "SUCCEEDED", amount: 100 });
    expect(await C.handleWebhook("sandbox", cheap, signed(cheap))).toMatchObject({ result: "ignored", detail: "AMOUNT_MISMATCH 100 != 25000" });
    const usd = body({ id: `evt_usd_${TAG}`, tx: t.providerTransactionId!, status: "SUCCEEDED", currency: "USD" });
    expect(await C.handleWebhook("sandbox", usd, signed(usd))).toMatchObject({ result: "ignored" });
    expect((await txOf(s.reference)).status).toBe("PENDING");
    const failed = body({ id: `evt_fail_${TAG}`, tx: t.providerTransactionId!, status: "FAILED" });
    expect(await C.handleWebhook("sandbox", failed, signed(failed))).toMatchObject({ result: "processed" });
    const after = await txOf(s.reference);
    expect([after.status, after.subscription?.status]).toEqual(["FAILED", "CANCELLED"]);
  });

  it("starting again cancels the previous unfinished attempt; an earlier attempt can't be activated afterwards", async () => {
    const a = await C.startCardPayment(otherId, planId);
    const b = await C.startCardPayment(otherId, planId);
    if (!a.ok || !b.ok) throw new Error("start");
    const ta = await txOf(a.reference);
    expect([ta.status, ta.subscription?.status]).toEqual(["CANCELLED", "CANCELLED"]);
    const late = body({ id: `evt_late_${TAG}`, tx: ta.providerTransactionId!, status: "SUCCEEDED" });
    expect(await C.handleWebhook("sandbox", late, signed(late))).toMatchObject({ result: "ignored", detail: "ALREADY_FINAL" });
    expect((await txOf(a.reference)).subscription?.status).toBe("CANCELLED");
  });

  it("concurrent duplicate deliveries activate exactly once", async () => {
    const u = await mkUser();
    const s = await C.startCardPayment(u.id, planId);
    if (!s.ok) throw new Error(s.code);
    const t = await txOf(s.reference);
    const raws = Array.from({ length: 5 }, (_, i) => body({ id: `evt_race_${TAG}_${i % 2}`, tx: t.providerTransactionId!, status: "SUCCEEDED" }));
    const results = await Promise.all(raws.map((r) => C.handleWebhook("sandbox", r, signed(r)).catch(() => ({ status: 500, result: "rejected" as const }))));
    expect(results.filter((r) => r.result === "processed")).toHaveLength(1);
    expect(await db.subscription.count({ where: { userId: u.id, status: "ACTIVE" } })).toBe(1);
  });

  it("unverified accounts and inactive plans are refused; sandbox completion is owner-only and goes through signature checks", async () => {
    const unverified = await mkUser(false);
    expect(await C.startCardPayment(unverified.id, planId)).toEqual({ ok: false, code: "ACCOUNT_UNVERIFIED" });
    expect(await C.startCardPayment(userId, "nope")).toEqual({ ok: false, code: "PLAN_NOT_FOUND" });
    const u = await mkUser();
    const s = await C.startCardPayment(u.id, planId);
    if (!s.ok) throw new Error(s.code);
    expect(await C.completeSandbox(otherId, s.reference, "SUCCEEDED")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await C.completeSandbox(u.id, s.reference, "SUCCEEDED")).toMatchObject({ ok: true, result: "processed" });
    expect((await txOf(s.reference)).subscription?.status).toBe("ACTIVE");
  });
});

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// مخزن cookies بسيط بدل next/headers
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
}));

process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123456";

import { db } from "../db";
import { normalizePhone } from "./normalize";
import { hashPassword, verifyPassword } from "./password";
import { setMailer } from "./mailer";
import { rateLimit } from "./ratelimit";
import { completeOtp, login, register, registerSchema, requestPasswordReset, resetPassword } from "./service";
import { DEVICE_COOKIE, SESSION_COOKIE, loadAuth } from "./session";
import { issueEmailOtp, verifyEmailOtp } from "./otp";
import { requirePaid } from "./route";

const sent: { to: string; text: string }[] = [];
setMailer({ async send(m) { sent.push(m); } });
const lastCode = () => sent.at(-1)!.text.match(/\b(\d{6})\b/)![1];
const lastToken = () => decodeURIComponent(sent.at(-1)!.text.match(/token=([^\s]+)/)![1]);

const meta = { ip: "1.1.1.1", userAgent: "vitest" };
let n = 0;
const mk = () => {
  n++;
  const tag = `${Date.now()}${n}`;
  return { fullName: "مدرس تجريبي", phone: `+96477${String(tag).slice(-8).padStart(8, "0")}`, email: `t${tag}@example.test`, password: "Passw0rd-long", passwordConfirm: "Passw0rd-long", schoolName: "ثانوية الاختبار", governorateCode: "BAGHDAD", directorateCode: "", specialization: "رياضيات" };
};
async function input() {
  const d = await db.educationDirectorate.findFirstOrThrow({ include: { governorate: true } });
  return registerSchema.parse({ ...mk(), governorateCode: d.governorate.code, directorateCode: d.code });
}

beforeEach(() => { jar.clear(); sent.length = 0; });
afterAll(async () => { await db.user.deleteMany({ where: { email: { endsWith: "@example.test" } } }); await db.$disconnect(); });

describe("normalize / password", () => {
  it("normalizes Iraqi phones", () => {
    expect(normalizePhone("07701234567")).toBe("+9647701234567");
    expect(normalizePhone("٠٧٧٠١٢٣٤٥٦٧")).toBe("+9647701234567");
    expect(normalizePhone("+964 770 123 4567")).toBe("+9647701234567");
    expect(normalizePhone("0123")).toBeNull();
  });
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("Passw0rd-long");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "Passw0rd-long")).toBe(true);
    expect(await verifyPassword(h, "nope")).toBe(false);
  });
  it("rejects weak passwords and mismatches", async () => {
    const base = await input();
    expect(registerSchema.safeParse({ ...base, password: "short1", passwordConfirm: "short1" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, passwordConfirm: "different-Pass1" }).success).toBe(false);
  });
});

describe("OTP", () => {
  it("is single-use, hashed at rest, and attempt-limited", async () => {
    const i = await input();
    const r = await register(i);
    expect(r.ok).toBe(true);
    const code = lastCode();
    const row = await db.emailVerification.findFirstOrThrow({ where: { user: { email: i.email } } });
    expect(row.codeHash).not.toContain(code);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let k = 0; k < 5; k++) expect((await verifyEmailOtp(row.id, wrong)).ok).toBe(false);
    expect(await verifyEmailOtp(row.id, code)).toEqual({ ok: false, reason: "TOO_MANY_ATTEMPTS" });
  });
  it("expires and enforces resend cooldown", async () => {
    const i = await input();
    const r = await register(i);
    if (!r.ok) throw new Error();
    const code = lastCode();
    const u = await db.user.findUniqueOrThrow({ where: { email: i.email } });
    expect((await issueEmailOtp(u.id, u.email, "SIGNUP")).ok).toBe(false);
    expect(await verifyEmailOtp(r.challengeId, code, new Date(Date.now() + 11 * 60_000))).toEqual({ ok: false, reason: "EXPIRED" });
  });
  it("is consumed on success", async () => {
    const i = await input();
    const r = await register(i);
    if (!r.ok) throw new Error();
    const code = lastCode();
    expect((await verifyEmailOtp(r.challengeId, code)).ok).toBe(true);
    expect((await verifyEmailOtp(r.challengeId, code)).ok).toBe(false);
  });
});

describe("register + login", () => {
  it("rejects duplicates and mismatched directorates", async () => {
    const i = await input();
    expect((await register(i)).ok).toBe(true);
    expect(await register(i)).toEqual({ ok: false, code: "EMAIL_TAKEN" });
    expect(await register({ ...i, email: "other@example.test" })).toEqual({ ok: false, code: "PHONE_TAKEN" });
    expect(await register({ ...i, email: "o2@example.test", phone: "+9647000000001", governorateCode: "NOPE" })).toEqual({ ok: false, code: "INVALID_DIRECTORATE" });
  });

  it("email verification creates a session but the account stays unverified without phone (SMS is Phase 5)", async () => {
    const i = await input();
    const r = await register(i);
    if (!r.ok) throw new Error();
    expect((await completeOtp(r.challengeId, lastCode(), false, meta)).ok).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { email: i.email } });
    expect(u.emailVerifiedAt).not.toBeNull();
    expect(u.status).toBe("PENDING_VERIFICATION");
    const auth = await loadAuth(jar.get(SESSION_COOKIE));
    expect(auth?.access).toBe("UNVERIFIED");
    // خدمة مدفوعة ممنوعة على الخادم
    const g = await requirePaid();
    expect("res" in g && g.res.status).toBe(403);
  });

  it("login: wrong password is generic, then lockout, then OTP + trusted device", async () => {
    const i = await input();
    const r = await register(i);
    if (!r.ok) throw new Error();
    await completeOtp(r.challengeId, lastCode(), false, meta);
    jar.clear();

    expect(await login("nobody@example.test", "x", meta)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(await login(i.email, "wrong-pass-123", meta)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });

    const step = await login(i.phone, i.password, meta);
    expect(step).toMatchObject({ ok: true, step: "otp", purpose: "LOGIN" });
    if (!step.ok || step.step !== "otp") throw new Error();
    expect(jar.has(SESSION_COOKIE)).toBe(false); // لا جلسة قبل OTP
    expect((await completeOtp(step.challengeId, lastCode(), true, meta)).ok).toBe(true);
    expect(jar.has(SESSION_COOKIE) && jar.has(DEVICE_COOKIE)).toBe(true);

    // الجهاز الموثوق يتخطى OTP
    jar.delete(SESSION_COOKIE);
    sent.length = 0;
    expect(await login(i.email, i.password, meta)).toEqual({ ok: true, step: "done" });
    expect(sent).toHaveLength(0);

    // قفل بعد 5 محاولات فاشلة
    jar.clear();
    for (let k = 0; k < 5; k++) await login(i.email, "bad-password-1", meta);
    expect(await login(i.email, i.password, meta)).toEqual({ ok: false, code: "LOCKED" });
  });
});

describe("password reset", () => {
  it("is single-use, sends nothing for unknown accounts, and revokes sessions", async () => {
    const i = await input();
    const r = await register(i);
    if (!r.ok) throw new Error();
    await completeOtp(r.challengeId, lastCode(), false, meta);
    const token = jar.get(SESSION_COOKIE);
    sent.length = 0;
    await requestPasswordReset("ghost@example.test");
    expect(sent).toHaveLength(0);
    await requestPasswordReset(i.email);
    const t = lastToken();
    const stored = await db.passwordResetToken.findFirstOrThrow({ where: { user: { email: i.email } } });
    expect(stored.tokenHash).not.toContain(t);
    expect(await resetPassword(t, "short")).toEqual({ ok: false, code: "WEAK_PASSWORD" });
    expect((await resetPassword(t, "N3w-password-ok")).ok).toBe(true);
    expect(await resetPassword(t, "N3w-password-ok2")).toEqual({ ok: false, code: "INVALID_TOKEN" });
    expect(await loadAuth(token)).toBeNull();
    jar.clear();
    expect(await login(i.email, "N3w-password-ok", meta)).toMatchObject({ ok: true });
  });
});

describe("rate limit", () => {
  it("blocks after the limit within a window", async () => {
    const key = `test:${Date.now()}`;
    const res = [];
    for (let k = 0; k < 4; k++) res.push(await rateLimit(key, 3, 60));
    expect(res).toEqual([true, true, true, false]);
  });
});

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
import { setSmsSender, SmsUnavailableError } from "./sms";
import { completeOtp, confirmChannelVerification, login, register, registerSchema, requestPasswordReset, resetPassword, setLoginSecurity, startChannelVerification } from "./service";
import { DEVICE_COOKIE, SESSION_COOKIE, loadAuth } from "./session";
import { issueOtp, verifyOtps } from "./otp";
import { requirePaid } from "./route";

const sent: { to: string; text: string }[] = [];
const sms: { to: string; text: string }[] = [];
setMailer({ async send(m) { sent.push(m); } });
const codeOf = (text: string) => text.match(/\b(\d{6})\b/)![1];
const lastCode = () => codeOf(sent.at(-1)!.text);
const lastSmsCode = () => codeOf(sms.at(-1)!.text);
const lastToken = () => decodeURIComponent(sent.at(-1)!.text.match(/token=([^\s]+)/)![1]);
const withSms = () => setSmsSender({ async send(m) { sms.push(m); } });
const noSms = () => setSmsSender(undefined);

const meta = { ip: "1.1.1.1", userAgent: "vitest" };
let n = 0;
const mk = () => {
  n++;
  const tag = `${Date.now()}${n}`;
  return { fullName: "مدرس تجريبي", phone: `+96477${String(tag).slice(-8).padStart(8, "0")}`, email: `t${tag}@example.test`, password: "Passw0rd-long", passwordConfirm: "Passw0rd-long", schoolName: "ثانوية الاختبار", governorateCode: "BAGHDAD", directorateCode: "", specialization: "رياضيات" };
};
async function input(over: Record<string, unknown> = {}) {
  const d = await db.educationDirectorate.findFirstOrThrow({ include: { governorate: true } });
  return registerSchema.parse({ ...mk(), governorateCode: d.governorate.code, directorateCode: d.code, ...over });
}
/** مدرس مسجّل ومتحقق بالبريد (جاهز للدخول) */
async function emailUser() {
  const i = await input();
  const r = await register(i);
  if (!r.ok) throw new Error("register");
  expect((await completeOtp([{ challengeId: r.challenges[0].challengeId, code: lastCode() }], false, meta)).ok).toBe(true);
  jar.clear(); sent.length = 0;
  return i;
}
const cid = (r: { ok: true; challenges: { challengeId: string }[] } | { ok: false }) => { if (!r.ok) throw new Error("not ok"); return r.challenges.map((c) => c.challengeId); };

beforeEach(() => { jar.clear(); sent.length = 0; sms.length = 0; noSms(); });
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
    const [id] = cid(await register(i));
    const code = lastCode();
    const raw = id.slice(2);
    const row = await db.emailVerification.findUniqueOrThrow({ where: { id: raw } });
    expect(row.codeHash).not.toContain(code);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let k = 0; k < 5; k++) expect((await verifyOtps([{ challengeId: id, code: wrong }])).ok).toBe(false);
    expect(await verifyOtps([{ challengeId: id, code }])).toEqual({ ok: false, reason: "TOO_MANY_ATTEMPTS" });
  });
  it("expires and enforces resend cooldown", async () => {
    const i = await input();
    const [id] = cid(await register(i));
    const code = lastCode();
    const u = await db.user.findUniqueOrThrow({ where: { email: i.email } });
    expect((await issueOtp(u.id, "EMAIL", u.email, "SIGNUP")).ok).toBe(false);
    expect(await verifyOtps([{ challengeId: id, code }], new Date(Date.now() + 11 * 60_000))).toEqual({ ok: false, reason: "EXPIRED" });
  });
  it("is consumed on success and rejects malformed challenge ids", async () => {
    const [id] = cid(await register(await input()));
    const code = lastCode();
    expect((await verifyOtps([{ challengeId: id, code }])).ok).toBe(true);
    expect((await verifyOtps([{ challengeId: id, code }])).ok).toBe(false);
    expect((await verifyOtps([{ challengeId: "garbage", code }])).ok).toBe(false);
  });
});

describe("registration: ONE channel is enough", () => {
  it("rejects duplicates and mismatched directorates", async () => {
    const i = await input();
    expect((await register(i)).ok).toBe(true);
    expect(await register(i)).toEqual({ ok: false, code: "EMAIL_TAKEN" });
    expect(await register({ ...i, email: "other@example.test" })).toEqual({ ok: false, code: "PHONE_TAKEN" });
    expect(await register({ ...i, email: "o2@example.test", phone: "+9647000000001", governorateCode: "NOPE" })).toEqual({ ok: false, code: "INVALID_DIRECTORATE" });
  });

  it("e-mail verification alone activates the account (no phone needed) but gives no paid access", async () => {
    const i = await input();
    const r = await register(i);
    expect(sms).toHaveLength(0);
    expect((await completeOtp([{ challengeId: cid(r)[0], code: lastCode() }], false, meta)).ok).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { email: i.email } });
    expect(u).toMatchObject({ status: "ACTIVE", phoneVerifiedAt: null });
    const auth = await loadAuth(jar.get(SESSION_COOKIE));
    expect(auth?.access).toBe("AWAITING_PAYMENT");
    const g = await requirePaid();
    expect("res" in g && g.res.status).toBe(402);
  });

  it("phone-only verification works when SMS is available, and sends nothing by e-mail", async () => {
    withSms();
    const i = await input({ verificationChannel: "PHONE" });
    const r = await register(i);
    expect(sent).toHaveLength(0);
    expect(sms).toHaveLength(1);
    expect(sms[0].to).toBe(i.phone);
    expect((await completeOtp([{ challengeId: cid(r)[0], code: lastSmsCode() }], false, meta)).ok).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { email: i.email } });
    expect(u).toMatchObject({ status: "ACTIVE", emailVerifiedAt: null });
    expect(u.phoneVerifiedAt).not.toBeNull();
  });

  it("phone registration is refused honestly (and rolled back) while SMS is not configured", async () => {
    const i = await input({ verificationChannel: "PHONE" });
    await expect(register(i)).rejects.toBeInstanceOf(SmsUnavailableError);
    expect(await db.user.count({ where: { email: i.email } })).toBe(0);
  });
});

describe("login: by e-mail OR phone, one code on that channel", () => {
  it("wrong password is generic; code goes by e-mail when e-mail is used; lockout after 5 failures", async () => {
    const i = await emailUser();
    expect(await login("nobody@example.test", "x", meta)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(await login(i.email, "wrong-pass-123", meta)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });

    const step = await login(i.email, i.password, meta);
    expect(step).toMatchObject({ ok: true, step: "otp", purpose: "LOGIN" });
    if (!step.ok || step.step !== "otp") throw new Error();
    expect(step.challenges).toHaveLength(1);
    expect(step.challenges[0].channel).toBe("EMAIL");
    expect(jar.has(SESSION_COOKIE)).toBe(false); // لا جلسة قبل الرمز
    expect(sent).toHaveLength(1);
    expect((await completeOtp([{ challengeId: step.challenges[0].challengeId, code: lastCode() }], false, meta)).ok).toBe(true);
    expect(jar.has(SESSION_COOKIE)).toBe(true);

    jar.clear();
    for (let k = 0; k < 5; k++) await login(i.email, "bad-password-1", meta);
    expect(await login(i.email, i.password, meta)).toEqual({ ok: false, code: "LOCKED" });
  });

  it("typing the phone sends the code by SMS (if phone is verified and SMS available); otherwise falls back to the verified e-mail", async () => {
    const i = await emailUser();
    // الهاتف غير مؤكَّد + SMS غير متاح → البريد
    const a = await login(i.phone, i.password, meta);
    if (!a.ok || a.step !== "otp") throw new Error();
    expect(a.challenges[0].channel).toBe("EMAIL");
    expect(sms).toHaveLength(0);

    // أكّد الهاتف وفعّل SMS → الرمز على الهاتف عند الدخول به، وعلى البريد عند الدخول بالبريد
    await db.user.update({ where: { email: i.email }, data: { phoneVerifiedAt: new Date() } });
    withSms();
    await db.emailVerification.updateMany({ where: { user: { email: i.email } }, data: { consumedAt: new Date() } });
    const b = await login(i.phone, i.password, meta);
    if (!b.ok || b.step !== "otp") throw new Error();
    expect(b.challenges[0].channel).toBe("PHONE");
    expect(sms.at(-1)!.to).toBe(i.phone);
    expect((await completeOtp([{ challengeId: b.challenges[0].challengeId, code: lastSmsCode() }], false, meta)).ok).toBe(true);

    jar.clear();
    const c = await login(i.email, i.password, meta);
    if (!c.ok || c.step !== "otp") throw new Error();
    expect(c.challenges[0].channel).toBe("EMAIL");
  });

  it("trusted device skips the code in single mode", async () => {
    const i = await emailUser();
    const step = await login(i.email, i.password, meta);
    if (!step.ok || step.step !== "otp") throw new Error();
    await completeOtp([{ challengeId: step.challenges[0].challengeId, code: lastCode() }], true, meta);
    expect(jar.has(DEVICE_COOKIE)).toBe(true);
    jar.delete(SESSION_COOKIE);
    sent.length = 0;
    expect(await login(i.email, i.password, meta)).toEqual({ ok: true, step: "done" });
    expect(sent).toHaveLength(0);
  });

  it("an account that never verified is asked to verify (one channel) at login", async () => {
    const i = await input();
    await register(i);
    sent.length = 0;
    await db.emailVerification.updateMany({ where: { user: { email: i.email } }, data: { consumedAt: new Date() } });
    const step = await login(i.email, i.password, meta);
    expect(step).toMatchObject({ ok: true, step: "otp", purpose: "SIGNUP" });
  });
});

describe("extra security: BOTH codes", () => {
  async function bothUser() {
    const i = await emailUser();
    withSms();
    const u = await db.user.findUniqueOrThrow({ where: { email: i.email } });
    // إضافة الهاتف كقناة ثانية عبر تدفق التحقق الحقيقي
    const st = await startChannelVerification(u.id, "PHONE");
    if (!st.ok) throw new Error("start");
    expect((await confirmChannelVerification(u.id, st.challenge.challengeId, lastSmsCode())).ok).toBe(true);
    return { i, u };
  }

  it("requires password, both verified channels and an available SMS provider", async () => {
    const i = await emailUser();
    const u = await db.user.findUniqueOrThrow({ where: { email: i.email } });
    expect(await setLoginSecurity(u.id, "BOTH", "wrong-password-1")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(await setLoginSecurity(u.id, "BOTH", i.password)).toEqual({ ok: false, code: "SMS_UNAVAILABLE" });
    withSms();
    expect(await setLoginSecurity(u.id, "BOTH", i.password)).toEqual({ ok: false, code: "BOTH_NOT_VERIFIED" });
    expect(await startChannelVerification(u.id, "EMAIL")).toEqual({ ok: false, code: "ALREADY_VERIFIED" });
  });

  it("login then needs the e-mail code AND the SMS code together; a single code never suffices", async () => {
    const { i, u } = await bothUser();
    expect((await setLoginSecurity(u.id, "BOTH", i.password)).ok).toBe(true);
    jar.clear(); sent.length = 0;

    const step = await login(i.email, i.password, meta);
    if (!step.ok || step.step !== "otp") throw new Error();
    expect(step.challenges.map((c) => c.channel).sort()).toEqual(["EMAIL", "PHONE"]);
    const e = step.challenges.find((c) => c.channel === "EMAIL")!;
    const ec = lastCode();

    // رمز واحد فقط → مرفوض ولا جلسة
    expect((await completeOtp([{ challengeId: e.challengeId, code: ec }], false, meta)).ok).toBe(false);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("a wrong code on one channel fails the pair without burning the right one; then both succeed", async () => {
    const { i, u } = await bothUser();
    await setLoginSecurity(u.id, "BOTH", i.password);
    jar.clear(); sent.length = 0; sms.length = 0;
    const step = await login(i.phone, i.password, meta);
    if (!step.ok || step.step !== "otp") throw new Error();
    const e = step.challenges.find((c) => c.channel === "EMAIL")!;
    const p = step.challenges.find((c) => c.channel === "PHONE")!;
    const ec = lastCode();
    const pc = lastSmsCode();
    const badP = pc === "000000" ? "111111" : "000000";
    expect((await completeOtp([{ challengeId: e.challengeId, code: ec }, { challengeId: p.challengeId, code: badP }], false, meta)).ok).toBe(false);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    expect((await completeOtp([{ challengeId: e.challengeId, code: ec }, { challengeId: p.challengeId, code: pc }], true, meta)).ok).toBe(true);
    expect(jar.has(SESSION_COOKIE)).toBe(true);
    expect(jar.has(DEVICE_COOKIE)).toBe(false); // لا جهاز موثوق في الوضع المشدّد
  });

  it("is never bypassed by a trusted device, and can be turned back to single with the password", async () => {
    const { i, u } = await bothUser();
    // جهاز موثوق من الوضع الفردي
    const s1 = await login(i.email, i.password, meta);
    if (!s1.ok || s1.step !== "otp") throw new Error();
    await completeOtp([{ challengeId: s1.challenges[0].challengeId, code: lastCode() }], true, meta);
    expect(jar.has(DEVICE_COOKIE)).toBe(true);
    await setLoginSecurity(u.id, "BOTH", i.password);
    jar.delete(SESSION_COOKIE);
    const s2 = await login(i.email, i.password, meta);
    expect(s2).toMatchObject({ ok: true, step: "otp" }); // لم يُتجاوز
    expect(await setLoginSecurity(u.id, "SINGLE", "wrong-password-1")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect((await setLoginSecurity(u.id, "SINGLE", i.password)).ok).toBe(true);
  });

  it("fails closed (no downgrade) when BOTH is on but SMS is not available", async () => {
    const { i, u } = await bothUser();
    await setLoginSecurity(u.id, "BOTH", i.password);
    noSms();
    jar.clear();
    expect(await login(i.email, i.password, meta)).toEqual({ ok: false, code: "NO_CHANNEL_AVAILABLE" });
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("password reset", () => {
  it("is single-use, sends nothing for unknown accounts, and revokes sessions", async () => {
    const i = await input();
    const r = await register(i);
    await completeOtp([{ challengeId: cid(r)[0], code: lastCode() }], false, meta);
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

  it("is only e-mailed to a VERIFIED address (phone-only accounts get no link)", async () => {
    withSms();
    const i = await input({ verificationChannel: "PHONE" });
    const r = await register(i);
    await completeOtp([{ challengeId: cid(r)[0], code: lastSmsCode() }], false, meta);
    sent.length = 0;
    await requestPasswordReset(i.email);
    expect(sent).toHaveLength(0);
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

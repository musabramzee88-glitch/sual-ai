import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { codeSchema } from "../http";
import { hmac, randomToken } from "./crypto";
import { getMailer } from "./mailer";
import { classifyIdentifier, emailSchema, phoneSchema } from "./normalize";
import { describeChallenge, issueOtp, maskAddress, verifyOtps, type Channel, type IssueResult } from "./otp";
import { smsAvailable } from "./sms";
import { dummyVerify, hashPassword, passwordSchema, verifyPassword } from "./password";
import { createSession, isTrustedDevice, revokeAllSessions, trustThisDevice } from "./session";

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(3).max(120),
    phone: phoneSchema,
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    schoolName: z.string().trim().min(2).max(160),
    governorateCode: codeSchema,
    directorateCode: codeSchema,
    specialization: z.string().trim().min(2).max(120),
    /** القناة التي يتحقق بها الآن (واحدة تكفي لتفعيل الحساب) */
    verificationChannel: z.enum(["EMAIL", "PHONE"]).default("EMAIL"),
  })
  .refine((v) => v.password === v.passwordConfirm, { message: "PASSWORD_MISMATCH", path: ["passwordConfirm"] });

export type Meta = { ip?: string; userAgent?: string | null };
type Fail<C extends string> = { ok: false; code: C };
const fail = <C extends string>(code: C): Fail<C> => ({ ok: false, code });

/** يفعّل الحساب عند تحقق قناة واحدة على الأقل (بريد أو هاتف). */
async function activateIfVerified(userId: string) {
  await db.user.updateMany({
    where: { id: userId, status: "PENDING_VERIFICATION", OR: [{ emailVerifiedAt: { not: null } }, { phoneVerifiedAt: { not: null } }] },
    data: { status: "ACTIVE" },
  });
}

export type ChallengeView = { challengeId: string; channel: Channel; masked: string; resendAvailableAt: Date };
const view = (r: Extract<IssueResult, { ok: true }>, address: string): ChallengeView => ({ challengeId: r.challengeId, channel: r.channel, masked: maskAddress(r.channel, address), resendAvailableAt: r.resendAvailableAt });
const addressOf = (u: { email: string; phone: string }, c: Channel) => (c === "EMAIL" ? u.email : u.phone);

// ───────────────────────── التسجيل ─────────────────────────
export async function register(input: z.infer<typeof registerSchema>) {
  const dir = await db.educationDirectorate.findUnique({ where: { code: input.directorateCode }, include: { governorate: true } });
  if (!dir || !dir.isActive || dir.governorate.code !== input.governorateCode) return fail("INVALID_DIRECTORATE");

  const dup = await db.user.findFirst({ where: { OR: [{ email: input.email }, { phone: input.phone }] }, select: { email: true } });
  if (dup) return fail(dup.email === input.email ? ("EMAIL_TAKEN" as const) : ("PHONE_TAKEN" as const));

  const passwordHash = await hashPassword(input.password);
  let userId: string;
  try {
    const user = await db.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        passwordChangedAt: new Date(),
        teacherProfile: {
          create: {
            directorateId: dir.id,
            specialization: input.specialization,
            schools: { create: { name: input.schoolName, directorateId: dir.id, isPrimary: true } },
          },
        },
      },
    });
    userId = user.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("EMAIL_TAKEN" as const);
    throw e;
  }
  const channel = input.verificationChannel;
  let issued: IssueResult;
  try {
    issued = await issueOtp(userId, channel, addressOf(input, channel), "SIGNUP");
  } catch (e) {
    // تعذّر الإرسال: لا نترك حساباً لا يستطيع صاحبه تأكيده
    await db.user.delete({ where: { id: userId } });
    throw e;
  }
  return issued.ok ? { ok: true as const, userId, challenges: [view(issued, addressOf(input, channel))] } : fail("OTP_COOLDOWN" as const);
}

// ───────────────────────── الدخول ─────────────────────────
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;

export type LoginResult =
  | { ok: true; step: "otp"; purpose: "LOGIN" | "SIGNUP"; challenges: ChallengeView[] }
  | { ok: true; step: "done" }
  | Fail<"INVALID_CREDENTIALS" | "LOCKED" | "OTP_COOLDOWN" | "ACCOUNT_BANNED" | "NO_CHANNEL_AVAILABLE">;

type U = { emailVerifiedAt: Date | null; phoneVerifiedAt: Date | null };
const channelUsable = (c: Channel) => c === "EMAIL" || smsAvailable();

/**
 * يختار قناة الرمز: القناة التي دخل بها المستخدم أولاً (بريد أو هاتف) إن كانت مؤكَّدة ومتاحة،
 * وإلا القناة الأخرى المؤكَّدة. لحساب لم يتحقق بعد: القناة التي كتبها إن كانت متاحة.
 */
function pickChannel(u: U, typed: Channel): Channel | null {
  const order: Channel[] = typed === "EMAIL" ? ["EMAIL", "PHONE"] : ["PHONE", "EMAIL"];
  const verified = order.filter((c) => (c === "EMAIL" ? u.emailVerifiedAt : u.phoneVerifiedAt));
  const pool = verified.length ? verified : order;
  return pool.find(channelUsable) ?? null;
}

export async function login(identifier: string, password: string, meta: Meta, now = new Date()): Promise<LoginResult> {
  const id = classifyIdentifier(identifier);
  const typed: Channel = id && "phone" in id ? "PHONE" : "EMAIL";
  const user = id ? await db.user.findUnique({ where: id }) : null;
  if (!user) {
    await dummyVerify(password);
    return fail("INVALID_CREDENTIALS");
  }
  if (user.lockedUntil && user.lockedUntil > now) return fail("LOCKED");
  if (!(await verifyPassword(user.passwordHash, password))) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: failed >= MAX_FAILED ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) } : { failedLoginCount: failed },
    });
    return fail("INVALID_CREDENTIALS");
  }
  if (user.status === "BANNED") return fail("ACCOUNT_BANNED");
  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });

  const cooldown = (r: IssueResult): r is Extract<IssueResult, { ok: false }> => !r.ok;

  // حساب لم يتحقق بعد: أكمل التحقق بقناة واحدة
  if (!user.emailVerifiedAt && !user.phoneVerifiedAt) {
    const ch = pickChannel(user, typed);
    if (!ch) return fail("NO_CHANNEL_AVAILABLE");
    const r = await issueOtp(user.id, ch, addressOf(user, ch), "SIGNUP", now);
    return cooldown(r) ? fail("OTP_COOLDOWN") : { ok: true, step: "otp", purpose: "SIGNUP", challenges: [view(r, addressOf(user, ch))] };
  }

  // أمان إضافي مفعّل: رمزان معاً (بريد + هاتف)، ولا يُتجاوز بالجهاز الموثوق
  if (user.loginSecurity === "BOTH") {
    if (!user.emailVerifiedAt || !user.phoneVerifiedAt || !smsAvailable()) return fail("NO_CHANNEL_AVAILABLE");
    const e = await issueOtp(user.id, "EMAIL", user.email, "LOGIN", now);
    const p = await issueOtp(user.id, "PHONE", user.phone, "LOGIN", now);
    if (cooldown(e) || cooldown(p)) return fail("OTP_COOLDOWN");
    return { ok: true, step: "otp", purpose: "LOGIN", challenges: [view(e, user.email), view(p, user.phone)] };
  }

  if (await isTrustedDevice(user.id, now)) {
    await finishLogin(user.id, meta, now);
    return { ok: true, step: "done" };
  }
  const ch = pickChannel(user, typed);
  if (!ch) return fail("NO_CHANNEL_AVAILABLE");
  const r = await issueOtp(user.id, ch, addressOf(user, ch), "LOGIN", now);
  return cooldown(r) ? fail("OTP_COOLDOWN") : { ok: true, step: "otp", purpose: "LOGIN", challenges: [view(r, addressOf(user, ch))] };
}

async function finishLogin(userId: string, meta: Meta, now: Date) {
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: now } });
  await createSession(userId, meta, now);
}

/** الخطوة الثانية: تحقق الرمز (أو الرمزين) ثم إنشاء الجلسة. */
export async function completeOtp(inputs: { challengeId: string; code: string }[], rememberDevice: boolean, meta: Meta, now = new Date()) {
  const v = await verifyOtps(inputs, now);
  if (!v.ok) return fail(v.reason);
  const { userId, purpose } = v.items[0];
  if (purpose !== "SIGNUP" && purpose !== "LOGIN") return fail("INVALID" as const);

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status === "BANNED") return fail("INVALID" as const);
  // الرمز صالح فقط للعنوان الحالي (لم يتغير منذ الإصدار)
  if (v.items.some((i) => i.address !== addressOf(user, i.channel))) return fail("INVALID" as const);

  const channels = new Set(v.items.map((i) => i.channel));
  if (purpose === "SIGNUP") {
    if (v.items.length !== 1) return fail("INVALID" as const);
    const ch = v.items[0].channel;
    await db.user.update({ where: { id: user.id }, data: ch === "EMAIL" ? { emailVerifiedAt: user.emailVerifiedAt ?? now } : { phoneVerifiedAt: user.phoneVerifiedAt ?? now } });
    await activateIfVerified(user.id);
  } else if (user.loginSecurity === "BOTH") {
    if (!(channels.has("EMAIL") && channels.has("PHONE"))) return fail("INVALID" as const);
  } else {
    const ch = v.items[0].channel;
    if (v.items.length !== 1 || !(ch === "EMAIL" ? user.emailVerifiedAt : user.phoneVerifiedAt)) return fail("INVALID" as const);
  }
  await finishLogin(user.id, meta, now);
  if (rememberDevice && purpose === "LOGIN" && user.loginSecurity === "SINGLE") await trustThisDevice(user.id, meta.userAgent, now);
  return { ok: true as const };
}

export async function resendOtp(challengeId: string, now = new Date()) {
  const d = await describeChallenge(challengeId);
  if (!d || (d.purpose !== "SIGNUP" && d.purpose !== "LOGIN")) return fail("INVALID" as const);
  const r = await issueOtp(d.userId, d.channel, d.address, d.purpose, now);
  return r.ok ? { ok: true as const, challenge: view(r, d.address) } : fail("OTP_COOLDOWN" as const);
}

// ───────────────────────── إعدادات الأمان (حساب المستخدم) ─────────────────────────
/** يرسل رمز تأكيد لقناة المستخدم الحالية (لإضافة القناة الثانية قبل تفعيل «الاثنين») */
export async function startChannelVerification(userId: string, channel: Channel, now = new Date()) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) return fail("NOT_FOUND" as const);
  if (channel === "EMAIL" ? u.emailVerifiedAt : u.phoneVerifiedAt) return fail("ALREADY_VERIFIED" as const);
  const r = await issueOtp(u.id, channel, addressOf(u, channel), "CONTACT_CHANGE", now);
  return r.ok ? { ok: true as const, challenge: view(r, addressOf(u, channel)) } : fail("OTP_COOLDOWN" as const);
}

export async function confirmChannelVerification(userId: string, challengeId: string, code: string, now = new Date()) {
  const v = await verifyOtps([{ challengeId, code }], now);
  if (!v.ok) return fail(v.reason);
  const it = v.items[0];
  if (it.userId !== userId || it.purpose !== "CONTACT_CHANGE") return fail("INVALID" as const);
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (it.address !== addressOf(u, it.channel)) return fail("INVALID" as const);
  await db.user.update({ where: { id: userId }, data: it.channel === "EMAIL" ? { emailVerifiedAt: now } : { phoneVerifiedAt: now } });
  await activateIfVerified(userId);
  return { ok: true as const };
}

/** تفعيل/إلغاء «الاثنين معاً». يتطلب كلمة المرور؛ والتفعيل يتطلب قناتين مؤكَّدتين وSMS متاحاً. */
export async function setLoginSecurity(userId: string, mode: "SINGLE" | "BOTH", password: string) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) return fail("NOT_FOUND" as const);
  if (!(await verifyPassword(u.passwordHash, password))) return fail("INVALID_CREDENTIALS" as const);
  if (mode === "BOTH") {
    if (!smsAvailable()) return fail("SMS_UNAVAILABLE" as const);
    if (!u.emailVerifiedAt || !u.phoneVerifiedAt) return fail("BOTH_NOT_VERIFIED" as const);
  }
  await db.user.update({ where: { id: userId }, data: { loginSecurity: mode } });
  return { ok: true as const };
}

// ───────────────────────── استعادة كلمة المرور ─────────────────────────
const RESET_TTL_MS = 30 * 60_000;
const resetHash = (t: string) => hmac("pwreset", t);

/** يردّ دائماً بالنجاح للمستدعي (لا كشف لوجود الحساب)؛ الإرسال يحدث فقط إن وُجد. */
export async function requestPasswordReset(identifier: string, now = new Date()) {
  const id = classifyIdentifier(identifier);
  const user = id ? await db.user.findUnique({ where: id }) : null;
  // الرابط يُرسل لبريد مؤكَّد فقط (لا لبريد لم يثبت صاحبه ملكيته)
  if (!user || user.status === "BANNED" || !user.emailVerifiedAt) return;
  const recent = await db.passwordResetToken.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - 60_000) } } });
  if (recent) return;
  const token = randomToken();
  await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: resetHash(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS) } });
  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await getMailer().send({
    to: user.email,
    subject: "استعادة كلمة المرور — سُؤال AI",
    text: `لإعادة تعيين كلمة المرور افتح الرابط (صالح 30 دقيقة):\n${link}\n\nإن لم تطلب ذلك فتجاهل الرسالة.\n\nReset your password (valid 30 minutes):\n${link}`,
  });
}

export async function resetPassword(token: string, newPassword: string, now = new Date()) {
  const pw = passwordSchema.safeParse(newPassword);
  if (!pw.success) return fail("WEAK_PASSWORD" as const);
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: resetHash(token) } });
  if (!row || row.usedAt || row.expiresAt <= now) return fail("INVALID_TOKEN" as const);
  const claimed = await db.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count !== 1) return fail("INVALID_TOKEN" as const);
  await db.user.update({
    where: { id: row.userId },
    data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: now, failedLoginCount: 0, lockedUntil: null },
  });
  await revokeAllSessions(row.userId); // يُنهي كل الجلسات والأجهزة الموثوقة
  return { ok: true as const };
}

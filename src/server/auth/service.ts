import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { codeSchema } from "../http";
import { hmac, randomToken } from "./crypto";
import { getMailer } from "./mailer";
import { classifyIdentifier, emailSchema, phoneSchema } from "./normalize";
import { issueEmailOtp, verifyEmailOtp, type IssueResult } from "./otp";
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
  })
  .refine((v) => v.password === v.passwordConfirm, { message: "PASSWORD_MISMATCH", path: ["passwordConfirm"] });

export type Meta = { ip?: string; userAgent?: string | null };
type Fail<C extends string> = { ok: false; code: C };
const fail = <C extends string>(code: C): Fail<C> => ({ ok: false, code });

/** يفعّل الحساب فقط عند نجاح تحقق البريد **و** الهاتف معاً (SPEC §3). */
async function activateIfFullyVerified(userId: string) {
  await db.user.updateMany({
    where: { id: userId, status: "PENDING_VERIFICATION", emailVerifiedAt: { not: null }, phoneVerifiedAt: { not: null } },
    data: { status: "ACTIVE" },
  });
}

const otpOutcome = (r: IssueResult) =>
  r.ok ? { ok: true as const, challengeId: r.challengeId, resendAvailableAt: r.resendAvailableAt } : fail("OTP_COOLDOWN" as const);

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
  let issued: IssueResult;
  try {
    issued = await issueEmailOtp(userId, input.email, "SIGNUP");
  } catch (e) {
    // تعذّر إرسال البريد: لا نترك حساباً لا يستطيع صاحبه تأكيده
    await db.user.delete({ where: { id: userId } });
    throw e;
  }
  const o = otpOutcome(issued);
  return o.ok ? { ...o, userId } : o;
}

// ───────────────────────── الدخول ─────────────────────────
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;

export type LoginResult =
  | { ok: true; step: "otp"; challengeId: string; purpose: "LOGIN" | "SIGNUP" }
  | { ok: true; step: "done" }
  | Fail<"INVALID_CREDENTIALS" | "LOCKED" | "OTP_COOLDOWN" | "ACCOUNT_BANNED">;

export async function login(identifier: string, password: string, meta: Meta, now = new Date()): Promise<LoginResult> {
  const id = classifyIdentifier(identifier);
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

  // بريد غير مؤكد → أكمل تأكيد البريد أولاً
  if (!user.emailVerifiedAt) {
    const r = otpOutcome(await issueEmailOtp(user.id, user.email, "SIGNUP", now));
    return r.ok ? { ok: true, step: "otp", challengeId: r.challengeId, purpose: "SIGNUP" } : r;
  }
  if (await isTrustedDevice(user.id, now)) {
    await finishLogin(user.id, meta, now);
    return { ok: true, step: "done" };
  }
  const r = otpOutcome(await issueEmailOtp(user.id, user.email, "LOGIN", now));
  return r.ok ? { ok: true, step: "otp", challengeId: r.challengeId, purpose: "LOGIN" } : r;
}

async function finishLogin(userId: string, meta: Meta, now: Date) {
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: now } });
  await createSession(userId, meta, now);
}

/** الخطوة الثانية: تحقق OTP (تأكيد التسجيل أو الدخول) ثم إنشاء الجلسة. */
export async function completeOtp(challengeId: string, code: string, rememberDevice: boolean, meta: Meta, now = new Date()) {
  const v = await verifyEmailOtp(challengeId, code, now);
  if (!v.ok) return fail(v.reason);
  if (v.purpose !== "SIGNUP" && v.purpose !== "LOGIN") return fail("INVALID" as const);

  const user = await db.user.findUnique({ where: { id: v.userId } });
  if (!user || user.status === "BANNED" || user.email !== v.email) return fail("INVALID" as const);

  if (v.purpose === "SIGNUP" && !user.emailVerifiedAt) {
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
    await activateIfFullyVerified(user.id);
  }
  await finishLogin(user.id, meta, now);
  if (rememberDevice && v.purpose === "LOGIN") await trustThisDevice(user.id, meta.userAgent, now);
  return { ok: true as const };
}

export async function resendOtp(challengeId: string, now = new Date()) {
  const row = await db.emailVerification.findUnique({ where: { id: challengeId } });
  if (!row || (row.purpose !== "SIGNUP" && row.purpose !== "LOGIN")) return fail("INVALID" as const);
  // لا يُعاد الإصدار إلا لرمز لم يُستهلك بنجاح (مستهلك بالنجاح = لا فائدة من إعادة الإرسال)
  const r = await issueEmailOtp(row.userId, row.email, row.purpose, now);
  return otpOutcome(r);
}

// ───────────────────────── استعادة كلمة المرور ─────────────────────────
const RESET_TTL_MS = 30 * 60_000;
const resetHash = (t: string) => hmac("pwreset", t);

/** يردّ دائماً بالنجاح للمستدعي (لا كشف لوجود الحساب)؛ الإرسال يحدث فقط إن وُجد. */
export async function requestPasswordReset(identifier: string, now = new Date()) {
  const id = classifyIdentifier(identifier);
  const user = id ? await db.user.findUnique({ where: id }) : null;
  if (!user || user.status === "BANNED") return;
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

import "server-only";
import { db } from "../db";
import { hmac, randomOtp, safeEqual } from "./crypto";
import { getMailer } from "./mailer";

export type OtpPurpose = "SIGNUP" | "LOGIN" | "CONTACT_CHANGE" | "PASSWORD_RESET";

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_RESEND_MS = 60_000;
const MAX_ATTEMPTS = 5;

const subjects: Record<OtpPurpose, string> = {
  SIGNUP: "رمز تأكيد البريد — سُؤال AI",
  LOGIN: "رمز تسجيل الدخول — سُؤال AI",
  CONTACT_CHANGE: "رمز تأكيد تغيير البيانات — سُؤال AI",
  PASSWORD_RESET: "رمز استعادة كلمة المرور — سُؤال AI",
};

const codeHash = (id: string, code: string) => hmac("email-otp", `${id}:${code}`);

export type IssueResult = { ok: true; challengeId: string; resendAvailableAt: Date } | { ok: false; reason: "COOLDOWN"; resendAvailableAt: Date };

/** يُصدر رمزاً جديداً (ويُبطل السابقة غير المستهلكة). يحترم مهلة إعادة الإرسال. */
export async function issueEmailOtp(userId: string, email: string, purpose: OtpPurpose, now = new Date()): Promise<IssueResult> {
  const last = await db.emailVerification.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (last && last.resendAvailableAt > now && last.email === email) {
    return { ok: false, reason: "COOLDOWN", resendAvailableAt: last.resendAvailableAt };
  }
  const code = randomOtp();
  const resendAvailableAt = new Date(now.getTime() + OTP_RESEND_MS);
  const row = await db.$transaction(async (tx) => {
    await tx.emailVerification.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: now } });
    const created = await tx.emailVerification.create({
      data: { userId, email, purpose, codeHash: "pending", expiresAt: new Date(now.getTime() + OTP_TTL_MS), resendAvailableAt, maxAttempts: MAX_ATTEMPTS },
    });
    return tx.emailVerification.update({ where: { id: created.id }, data: { codeHash: codeHash(created.id, code) } });
  });
  try {
    await getMailer().send({
      to: email,
      subject: subjects[purpose],
      text: `رمز التحقق: ${code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.\n\nVerification code: ${code}\nValid for 10 minutes. Do not share it.`,
    });
  } catch (e) {
    // لا يبقى رمز لم يصل للمستخدم
    await db.emailVerification.update({ where: { id: row.id }, data: { consumedAt: now } });
    throw e;
  }
  return { ok: true, challengeId: row.id, resendAvailableAt };
}

export type VerifyResult =
  | { ok: true; userId: string; purpose: OtpPurpose; email: string }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "TOO_MANY_ATTEMPTS" };

/** يتحقق من الرمز؛ يحتسب المحاولات ويستهلك الرمز عند النجاح (استخدام واحد). */
export async function verifyEmailOtp(challengeId: string, code: string, now = new Date()): Promise<VerifyResult> {
  const row = await db.emailVerification.findUnique({ where: { id: challengeId } });
  if (!row || row.consumedAt) return { ok: false, reason: "INVALID" };
  if (row.expiresAt <= now) return { ok: false, reason: "EXPIRED" };
  if (row.attempts >= row.maxAttempts) return { ok: false, reason: "TOO_MANY_ATTEMPTS" };

  // زيادة العدّاد أولاً بشكل ذرّي (يمنع سباق المحاولات المتوازية)
  const bumped = await db.emailVerification.updateMany({
    where: { id: row.id, consumedAt: null, attempts: { lt: row.maxAttempts } },
    data: { attempts: { increment: 1 } },
  });
  if (bumped.count !== 1) return { ok: false, reason: "TOO_MANY_ATTEMPTS" };

  if (!safeEqual(row.codeHash, codeHash(row.id, code))) return { ok: false, reason: "INVALID" };
  const consumed = await db.emailVerification.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
  if (consumed.count !== 1) return { ok: false, reason: "INVALID" };
  return { ok: true, userId: row.userId, purpose: row.purpose, email: row.email };
}

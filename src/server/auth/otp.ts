import "server-only";
import { db } from "../db";
import { hmac, randomOtp, safeEqual } from "./crypto";
import { getMailer } from "./mailer";
import { getSmsSender } from "./sms";

export type OtpPurpose = "SIGNUP" | "LOGIN" | "CONTACT_CHANGE" | "PASSWORD_RESET";
export type Channel = "EMAIL" | "PHONE";

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_RESEND_MS = 60_000;
const MAX_ATTEMPTS = 5;

const subjects: Record<OtpPurpose, string> = {
  SIGNUP: "رمز تأكيد الحساب — سُؤال AI",
  LOGIN: "رمز تسجيل الدخول — سُؤال AI",
  CONTACT_CHANGE: "رمز تأكيد البيانات — سُؤال AI",
  PASSWORD_RESET: "رمز استعادة كلمة المرور — سُؤال AI",
};

/** معرّف التحدّي يحمل قناته: E_<id> للبريد و P_<id> للهاتف. */
export const challengeIdOf = (channel: Channel, id: string) => `${channel === "EMAIL" ? "E" : "P"}_${id}`;
export function parseChallengeId(cid: string): { channel: Channel; id: string } | null {
  const m = /^([EP])_([A-Za-z0-9]{10,40})$/.exec(cid);
  return m ? { channel: m[1] === "E" ? "EMAIL" : "PHONE", id: m[2] } : null;
}

const codeHash = (channel: Channel, id: string, code: string) => hmac("otp", `${channel}:${id}:${code}`);

type Row = {
  id: string; userId: string; purpose: OtpPurpose; codeHash: string; attempts: number; maxAttempts: number;
  expiresAt: Date; resendAvailableAt: Date; consumedAt: Date | null; address: string;
};

/** محوّل موحّد فوق جدولَي EmailVerification وPhoneVerification */
const store = {
  async last(channel: Channel, userId: string, purpose: OtpPurpose): Promise<Row | null> {
    const where = { userId, purpose, consumedAt: null };
    const orderBy = { createdAt: "desc" as const };
    if (channel === "EMAIL") {
      const r = await db.emailVerification.findFirst({ where, orderBy });
      return r && { ...r, address: r.email };
    }
    const r = await db.phoneVerification.findFirst({ where, orderBy });
    return r && { ...r, address: r.phone };
  },
  async get(channel: Channel, id: string): Promise<Row | null> {
    if (channel === "EMAIL") {
      const r = await db.emailVerification.findUnique({ where: { id } });
      return r && { ...r, address: r.email };
    }
    const r = await db.phoneVerification.findUnique({ where: { id } });
    return r && { ...r, address: r.phone };
  },
  async replace(channel: Channel, userId: string, address: string, purpose: OtpPurpose, now: Date, resendAvailableAt: Date, code: string): Promise<string> {
    const common = { userId, purpose, codeHash: "pending", expiresAt: new Date(now.getTime() + OTP_TTL_MS), resendAvailableAt, maxAttempts: MAX_ATTEMPTS };
    return db.$transaction(async (tx) => {
      if (channel === "EMAIL") {
        await tx.emailVerification.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: now } });
        const c = await tx.emailVerification.create({ data: { ...common, email: address } });
        await tx.emailVerification.update({ where: { id: c.id }, data: { codeHash: codeHash(channel, c.id, code) } });
        return c.id;
      }
      await tx.phoneVerification.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: now } });
      const c = await tx.phoneVerification.create({ data: { ...common, phone: address } });
      await tx.phoneVerification.update({ where: { id: c.id }, data: { codeHash: codeHash(channel, c.id, code) } });
      return c.id;
    });
  },
  async consume(channel: Channel, id: string, now: Date) {
    if (channel === "EMAIL") await db.emailVerification.update({ where: { id }, data: { consumedAt: now } });
    else await db.phoneVerification.update({ where: { id }, data: { consumedAt: now } });
  },
  /** زيادة ذرّية للمحاولات؛ true إن نجحت (لم يُستهلك ولم يتجاوز الحد) */
  async bump(channel: Channel, id: string, max: number): Promise<boolean> {
    const where = { id, consumedAt: null, attempts: { lt: max } };
    const r = channel === "EMAIL"
      ? await db.emailVerification.updateMany({ where, data: { attempts: { increment: 1 } } })
      : await db.phoneVerification.updateMany({ where, data: { attempts: { increment: 1 } } });
    return r.count === 1;
  },
  async claim(channel: Channel, id: string, now: Date): Promise<boolean> {
    const r = channel === "EMAIL"
      ? await db.emailVerification.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: now } })
      : await db.phoneVerification.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: now } });
    return r.count === 1;
  },
};

export type IssueResult =
  | { ok: true; challengeId: string; channel: Channel; resendAvailableAt: Date }
  | { ok: false; reason: "COOLDOWN"; resendAvailableAt: Date };

/** يُصدر رمزاً جديداً على القناة (ويُبطل السابقة غير المستهلكة). يحترم مهلة إعادة الإرسال. */
export async function issueOtp(userId: string, channel: Channel, address: string, purpose: OtpPurpose, now = new Date()): Promise<IssueResult> {
  const last = await store.last(channel, userId, purpose);
  if (last && last.resendAvailableAt > now && last.address === address) {
    return { ok: false, reason: "COOLDOWN", resendAvailableAt: last.resendAvailableAt };
  }
  const code = randomOtp();
  const resendAvailableAt = new Date(now.getTime() + OTP_RESEND_MS);
  const id = await store.replace(channel, userId, address, purpose, now, resendAvailableAt, code);
  try {
    if (channel === "EMAIL") {
      await getMailer().send({
        to: address,
        subject: subjects[purpose],
        text: `رمز التحقق: ${code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.\n\nVerification code: ${code}\nValid for 10 minutes. Do not share it.`,
      });
    } else {
      await getSmsSender().send({ to: address, text: `Sual AI: ${code} (10 min / ١٠ دقائق). لا تشاركه / Do not share.` });
    }
  } catch (e) {
    await store.consume(channel, id, now); // لا يبقى رمز لم يصل للمستخدم
    throw e;
  }
  return { ok: true, challengeId: challengeIdOf(channel, id), channel, resendAvailableAt };
}

export type VerifiedOtp = { userId: string; purpose: OtpPurpose; channel: Channel; address: string };
export type VerifyResult = { ok: true; items: VerifiedOtp[] } | { ok: false; reason: "INVALID" | "EXPIRED" | "TOO_MANY_ATTEMPTS" };

/**
 * يتحقق من رمز أو أكثر معاً (وضع «الاثنين»): الكل أو لا شيء.
 * تُحتسب المحاولة لكل رمز، ويُستهلك كل رمز نجح استهلاكاً واحداً فقط عند نجاح المجموعة.
 */
export async function verifyOtps(inputs: { challengeId: string; code: string }[], now = new Date()): Promise<VerifyResult> {
  if (inputs.length === 0 || inputs.length > 2) return { ok: false, reason: "INVALID" };
  const parsed = inputs.map((i) => ({ ...i, p: parseChallengeId(i.challengeId) }));
  if (parsed.some((x) => !x.p) || new Set(parsed.map((x) => x.p!.channel)).size !== parsed.length) return { ok: false, reason: "INVALID" };

  const rows: { channel: Channel; row: Row; code: string }[] = [];
  for (const x of parsed) {
    const row = await store.get(x.p!.channel, x.p!.id);
    if (!row || row.consumedAt) return { ok: false, reason: "INVALID" };
    if (row.expiresAt <= now) return { ok: false, reason: "EXPIRED" };
    if (row.attempts >= row.maxAttempts) return { ok: false, reason: "TOO_MANY_ATTEMPTS" };
    rows.push({ channel: x.p!.channel, row, code: x.code });
  }
  if (new Set(rows.map((r) => r.row.userId)).size !== 1 || new Set(rows.map((r) => r.row.purpose)).size !== 1) return { ok: false, reason: "INVALID" };

  // العدّاد أولاً وبشكل ذرّي (يمنع سباق المحاولات المتوازية)
  for (const r of rows) if (!(await store.bump(r.channel, r.row.id, r.row.maxAttempts))) return { ok: false, reason: "TOO_MANY_ATTEMPTS" };
  if (!rows.every((r) => safeEqual(r.row.codeHash, codeHash(r.channel, r.row.id, r.code)))) return { ok: false, reason: "INVALID" };
  for (const r of rows) if (!(await store.claim(r.channel, r.row.id, now))) return { ok: false, reason: "INVALID" };
  return { ok: true, items: rows.map((r) => ({ userId: r.row.userId, purpose: r.row.purpose, channel: r.channel, address: r.row.address })) };
}

/** تفاصيل تحدٍّ لإعادة الإرسال (القناة والعنوان والغرض) */
export async function describeChallenge(cid: string) {
  const p = parseChallengeId(cid);
  if (!p) return null;
  const row = await store.get(p.channel, p.id);
  return row ? { channel: p.channel, userId: row.userId, purpose: row.purpose, address: row.address } : null;
}

/** قناع للعرض: a***@gmail.com / +964 *** *** 0776 */
export const maskAddress = (channel: Channel, a: string) =>
  channel === "EMAIL" ? a.replace(/^(.).*(@.*)$/, "$1***$2") : `${a.slice(0, 4)} *** *** ${a.slice(-4)}`;

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { db } from "../db";
import { assetPath } from "../exams/assets";
import { verifyPassword } from "./password";

/**
 * حذف الحساب بطلب صاحبه (مطلوب في متجر آبل لكل تطبيق فيه إنشاء حساب، وموعود به في «الخصوصية»).
 * لا يُحذف سطر المستخدم نفسه: سجلات الاشتراك والدفع مرتبطة به (Restrict) ويلزم حفظها قانونياً.
 * بدلاً من ذلك: تُمسح البيانات الشخصية (الاسم والبريد والهاتف وكلمة المرور) ويُحذف كل محتواه
 * (الامتحانات والقوالب والصور والجلسات والملف الشخصي)، ويُغلق الحساب فلا يمكن الدخول إليه.
 * الحسابات الإدارية لا تُحذف من هنا (يُزال الموظف من لوحة الإدارة أولاً).
 */
export async function deleteAccount(userId: string, password: string) {
  const user = await db.user.findUnique({ where: { id: userId }, include: { adminUser: true } });
  if (!user) return { ok: false as const, code: "NOT_FOUND" };
  if (user.role !== "TEACHER" || user.adminUser) return { ok: false as const, code: "ADMIN_ACCOUNT" };
  if (!(await verifyPassword(user.passwordHash, password))) return { ok: false as const, code: "INVALID_PASSWORD" };

  const assets = await db.templateAsset.findMany({ where: { ownerId: userId }, select: { storageKey: true } });
  const tag = `deleted-${userId}`;
  // رقم بصيغة E.164 (قيد في القاعدة) فريد وغير قابل للاستعمال: رمز الدولة 999 محجوز ولا يُعطى لأحد
  const fakePhone = `+999${BigInt("0x" + createHash("sha256").update(userId).digest("hex").slice(0, 12)).toString().padStart(11, "0").slice(-11)}`;
  await db.$transaction(async (tx) => {
    await tx.exam.deleteMany({ where: { ownerId: userId } });
    await tx.examTemplate.deleteMany({ where: { ownerId: userId } });
    await tx.userSession.deleteMany({ where: { userId } });
    await tx.trustedDevice.deleteMany({ where: { userId } });
    await tx.emailVerification.deleteMany({ where: { userId } });
    await tx.phoneVerification.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.teacherProfile.deleteMany({ where: { userId } });
    // الصور بعد القوالب والملف الشخصي (يشيران إليها)
    await tx.templateAsset.deleteMany({ where: { ownerId: userId } });
    // طلبات لم تُحسم تُلغى (لا تبقى في قائمة المراجعة لحساب محذوف)
    await tx.paymentRequest.updateMany({ where: { userId, status: "PENDING_REVIEW" }, data: { status: "CANCELLED" } });
    await tx.subscription.updateMany({ where: { userId, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await tx.user.update({
      where: { id: userId },
      data: {
        fullName: "حساب محذوف", email: `${tag}@deleted.invalid`, phone: fakePhone,
        // ليست صيغة argon2 صالحة: لا تطابق أي كلمة مرور
        passwordHash: `deleted:${randomBytes(24).toString("hex")}`,
        status: "BANNED", emailVerifiedAt: null, phoneVerifiedAt: null, loginSecurity: "SINGLE",
      },
    });
  });
  // الملفات بعد نجاح المعاملة (فشل حذف ملف لا يعيد البيانات)
  await Promise.all(assets.map((a) => rm(assetPath(a.storageKey), { force: true }).catch(() => {})));
  return { ok: true as const };
}

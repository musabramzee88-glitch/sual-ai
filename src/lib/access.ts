/**
 * سياسة الوصول للخدمات المدفوعة — مصدر الحقيقة الوحيد.
 * تُستدعى من الخادم في كل طلب يمس خدمة مدفوعة (لا يُعتمد على الواجهة).
 */
export type AccountStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "BANNED";
export type SubscriptionStatus =
  | "PENDING_PAYMENT"
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
  | "CANCELLED";

export type AccessState =
  | "UNVERIFIED"
  | "AWAITING_PAYMENT"
  | "AWAITING_APPROVAL"
  | "SUBSCRIPTION_ACTIVE"
  | "SUBSCRIPTION_EXPIRED"
  | "SUBSCRIPTION_SUSPENDED"
  | "ACCOUNT_SUSPENDED"
  | "BANNED";

export interface AccessInput {
  status: AccountStatus;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  /** أحدث اشتراك للمستخدم (أو null) */
  subscription: { status: SubscriptionStatus; endsAt: Date | null } | null;
}

export function resolveAccess(u: AccessInput, now: Date = new Date()): AccessState {
  if (u.status === "BANNED") return "BANNED";
  if (u.status === "SUSPENDED") return "ACCOUNT_SUSPENDED";
  if (u.status === "PENDING_VERIFICATION" || !u.emailVerifiedAt || !u.phoneVerifiedAt) return "UNVERIFIED";

  const s = u.subscription;
  if (!s || s.status === "PENDING_PAYMENT" || s.status === "CANCELLED") return "AWAITING_PAYMENT";
  if (s.status === "PENDING_APPROVAL") return "AWAITING_APPROVAL";
  if (s.status === "SUSPENDED") return "SUBSCRIPTION_SUSPENDED";
  if (s.status === "EXPIRED") return "SUBSCRIPTION_EXPIRED";
  // ACTIVE: يجب أن يكون له تاريخ انتهاء صالح ولم ينتهِ
  if (!s.endsAt || s.endsAt.getTime() <= now.getTime()) return "SUBSCRIPTION_EXPIRED";
  return "SUBSCRIPTION_ACTIVE";
}

export const canUsePaidServices = (u: AccessInput, now?: Date) =>
  resolveAccess(u, now) === "SUBSCRIPTION_ACTIVE";

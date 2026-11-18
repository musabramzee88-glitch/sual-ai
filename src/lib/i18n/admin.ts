import type { Locale } from "./dictionaries";

const ar = {
  panel: "لوحة الإدارة", back: "لوحة المدرس",
  nav: { home: "الإحصائيات", users: "المستخدمون", requests: "طلبات الدفع", subscriptions: "الاشتراكات", payments: "المدفوعات", plans: "الباقات", staff: "الموظفون", messages: "رسائل النظام", audit: "سجل التدقيق" },
  stats: { teachers: "المدرسون", activeAccounts: "الحسابات النشطة", activeSubs: "اشتراكات فعالة", expiredSubs: "اشتراكات منتهية", pending: "طلبات معلّقة", revenue: "إجمالي المدفوعات", exams: "الامتحانات", distribution: "التوزيع حسب الباقة", none: "لا بيانات بعد" },
  common: { name: "الاسم", email: "البريد", phone: "الهاتف", status: "الحالة", date: "التاريخ", actions: "إجراءات", plan: "الباقة", amount: "المبلغ", ref: "الرقم المرجعي", method: "الطريقة", admin: "المسؤول", note: "ملاحظة", search: "بحث…", all: "الكل", empty: "لا توجد بيانات", prev: "السابق", next: "التالي", save: "حفظ", create: "إنشاء", ends: "ينتهي", starts: "يبدأ", days: "يوم", iqd: "د.ع", yes: "نعم", no: "لا", open: "فتح", user: "المدرس" },
  act: { approve: "موافقة", reject: "رفض", rejectReason: "سبب الرفض", suspend: "إيقاف", ban: "حظر", activate: "إعادة تفعيل", verifyPhone: "تأكيد الهاتف يدوياً", verifyReason: "سبب التأكيد اليدوي (يُسجَّل في التدقيق)", extend: "تمديد", extendDays: "عدد أيام التمديد", cancel: "إلغاء", resume: "استئناف", confirm: "تأكيد التنفيذ؟", done: "تم" },
  users: { title: "المستخدمون", emailVerified: "البريد", phoneVerified: "الهاتف", verified: "مؤكَّد", notVerified: "غير مؤكَّد", subs: "الاشتراكات", payments: "المدفوعات", school: "المدرسة", directorate: "المديرية", specialization: "الاختصاص", lastLogin: "آخر دخول", manualWarn: "التأكيد اليدوي للهاتف إجراء استثنائي يُسجَّل باسمك في سجل التدقيق." },
  plans: { title: "الباقات", hint: "لا توجد أسعار افتراضية: أنشئ باقاتك هنا. تعديل السعر لا يغيّر الطلبات القائمة.", code: "الرمز (A-Z 0-9 _)", nameAr: "الاسم بالعربية", nameEn: "الاسم بالإنكليزية", duration: "المدة (أيام)", price: "السعر (دينار)", active: "فعّالة", enable: "تفعيل", disable: "تعطيل" },
  requests: { title: "طلبات الدفع النقدي", pendingOnly: "المعلّقة فقط", userNote: "ملاحظة المدرس" },
  staff: { title: "الموظفون والصلاحيات", add: "إضافة موظف (مستخدم موجود وموثَّق البريد)", superOnly: "إدارة الموظفين للمدير الرئيسي فقط.", perms: { VIEW_DASHBOARD: "عرض الإحصائيات", MANAGE_USERS: "إدارة المستخدمين", MANAGE_SUBSCRIPTIONS: "إدارة الاشتراكات", APPROVE_PAYMENTS: "الموافقة على الدفع", MANAGE_CURRICULUM: "إدارة المناهج", MANAGE_TEMPLATES: "إدارة القوالب", MANAGE_PLANS: "إدارة الباقات", MANAGE_SYSTEM_MESSAGES: "رسائل النظام", MANAGE_STAFF: "إدارة الموظفين", VIEW_AUDIT_LOG: "سجل التدقيق" } as Record<string, string> },
  messages: { title: "رسائل النظام", key: "المفتاح", keys: { cash_payment_instructions: "تعليمات الدفع النقدي (تظهر للمدرس)" } as Record<string, string>, locale: "اللغة", titleField: "العنوان", body: "النص" },
  audit: { title: "سجل التدقيق", action: "الإجراء", target: "الهدف" },
  statuses: {
    PENDING_VERIFICATION: "بانتظار التحقق", ACTIVE: "فعّال", SUSPENDED: "موقوف", BANNED: "محظور", EXPIRED: "منتهٍ", CANCELLED: "ملغى", PENDING_PAYMENT: "بانتظار الدفع", PENDING_APPROVAL: "بانتظار الموافقة",
    PENDING_REVIEW: "قيد المراجعة", APPROVED: "موافَق عليه", REJECTED: "مرفوض", INITIATED: "بدأ", PENDING: "معلّق", SUCCEEDED: "ناجح", FAILED: "فاشل", REFUNDED: "مُسترد", CASH: "نقداً", CARD: "بطاقة",
  } as Record<string, string>,
  errors: { NOT_PENDING: "الطلب ليس معلّقاً (ربما عولج مسبقاً).", FORBIDDEN: "ليست لديك صلاحية.", CANNOT_MODIFY_SELF: "لا يمكنك تعديل حسابك.", NOT_FOUND: "غير موجود.", NOT_ACTIVE: "الاشتراك غير فعّال.", ANOTHER_ACTIVE: "يوجد اشتراك فعال آخر.", ALREADY_VERIFIED: "الهاتف مؤكَّد مسبقاً.", CODE_TAKEN: "الرمز مستخدم.", USER_NOT_FOUND: "المستخدم غير موجود أو بريده غير موثَّق.", ALREADY_ADMIN: "المستخدم إداري أصلاً.", VALIDATION_ERROR: "تحقق من المدخلات.", RATE_LIMITED: "طلبات كثيرة.", GENERIC: "تعذّر تنفيذ العملية." } as Record<string, string>,
};
export type AdminDict = typeof ar;

const en: AdminDict = {
  panel: "Admin panel", back: "Teacher dashboard",
  nav: { home: "Statistics", users: "Users", requests: "Payment requests", subscriptions: "Subscriptions", payments: "Payments", plans: "Plans", staff: "Staff", messages: "System messages", audit: "Audit log" },
  stats: { teachers: "Teachers", activeAccounts: "Active accounts", activeSubs: "Active subscriptions", expiredSubs: "Expired subscriptions", pending: "Pending requests", revenue: "Total payments", exams: "Exams", distribution: "Distribution by plan", none: "No data yet" },
  common: { name: "Name", email: "Email", phone: "Phone", status: "Status", date: "Date", actions: "Actions", plan: "Plan", amount: "Amount", ref: "Reference", method: "Method", admin: "Admin", note: "Note", search: "Search…", all: "All", empty: "No data", prev: "Previous", next: "Next", save: "Save", create: "Create", ends: "Ends", starts: "Starts", days: "days", iqd: "IQD", yes: "Yes", no: "No", open: "Open", user: "Teacher" },
  act: { approve: "Approve", reject: "Reject", rejectReason: "Rejection reason", suspend: "Suspend", ban: "Ban", activate: "Reactivate", verifyPhone: "Verify phone manually", verifyReason: "Reason for manual verification (audited)", extend: "Extend", extendDays: "Days to extend", cancel: "Cancel", resume: "Resume", confirm: "Confirm this action?", done: "Done" },
  users: { title: "Users", emailVerified: "Email", phoneVerified: "Phone", verified: "Verified", notVerified: "Not verified", subs: "Subscriptions", payments: "Payments", school: "School", directorate: "Directorate", specialization: "Specialization", lastLogin: "Last login", manualWarn: "Manual phone verification is an exceptional action recorded under your name in the audit log." },
  plans: { title: "Plans", hint: "There are no default prices: create your plans here. Changing a price does not affect existing requests.", code: "Code (A-Z 0-9 _)", nameAr: "Arabic name", nameEn: "English name", duration: "Duration (days)", price: "Price (IQD)", active: "Active", enable: "Enable", disable: "Disable" },
  requests: { title: "Cash payment requests", pendingOnly: "Pending only", userNote: "Teacher note" },
  staff: { title: "Staff & permissions", add: "Add staff (existing user with verified email)", superOnly: "Staff management is for the super admin only.", perms: { VIEW_DASHBOARD: "View statistics", MANAGE_USERS: "Manage users", MANAGE_SUBSCRIPTIONS: "Manage subscriptions", APPROVE_PAYMENTS: "Approve payments", MANAGE_CURRICULUM: "Manage curriculum", MANAGE_TEMPLATES: "Manage templates", MANAGE_PLANS: "Manage plans", MANAGE_SYSTEM_MESSAGES: "System messages", MANAGE_STAFF: "Manage staff", VIEW_AUDIT_LOG: "View audit log" } },
  messages: { title: "System messages", key: "Key", keys: { cash_payment_instructions: "Cash payment instructions (shown to teachers)" }, locale: "Language", titleField: "Title", body: "Text" },
  audit: { title: "Audit log", action: "Action", target: "Target" },
  statuses: {
    PENDING_VERIFICATION: "Pending verification", ACTIVE: "Active", SUSPENDED: "Suspended", BANNED: "Banned", EXPIRED: "Expired", CANCELLED: "Cancelled", PENDING_PAYMENT: "Awaiting payment", PENDING_APPROVAL: "Awaiting approval",
    PENDING_REVIEW: "Under review", APPROVED: "Approved", REJECTED: "Rejected", INITIATED: "Initiated", PENDING: "Pending", SUCCEEDED: "Succeeded", FAILED: "Failed", REFUNDED: "Refunded", CASH: "Cash", CARD: "Card",
  },
  errors: { NOT_PENDING: "The request is not pending (maybe already handled).", FORBIDDEN: "You do not have permission.", CANNOT_MODIFY_SELF: "You cannot modify your own account.", NOT_FOUND: "Not found.", NOT_ACTIVE: "The subscription is not active.", ANOTHER_ACTIVE: "Another active subscription exists.", ALREADY_VERIFIED: "Phone is already verified.", CODE_TAKEN: "Code already in use.", USER_NOT_FOUND: "User not found or e-mail not verified.", ALREADY_ADMIN: "User is already an admin.", VALIDATION_ERROR: "Check the inputs.", RATE_LIMITED: "Too many requests.", GENERIC: "The operation failed." },
};
export const adminDicts: Record<Locale, AdminDict> = { ar, en };

export const fmtDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");
export const fmtDateTime = (d: Date | string) => new Date(d).toLocaleString("en-GB", { hour12: false });
export const fmtIqd = (n: number, t: AdminDict) => `${n.toLocaleString("en-US")} ${t.common.iqd}`;

import '../api/client.dart';
import '../catalog.g.dart';

/// رسالة عربية لخطأ الخادم: نفس نصوص الموقع (catalog.g.dart)، ثم رسائل عامة حسب الحالة
String messageOf(Object e) {
  if (e is ApiError) {
    // لا ذكر للاشتراك أو الدفع داخل التطبيق (سياسة المتاجر): رسالة محايدة
    if (e.code.startsWith('SUBSCRIPTION') || e.code.startsWith('PAYMENT') || e.code == 'PLAN_NOT_FOUND') return 'حسابك غير مفعّل لهذه الخدمة.';
    final m = errorsAr[e.code];
    if (m != null) return m;
    if (e.code == 'NOT_FOUND') return 'لم يُعثر عليه (ربما حُذف).';
    if (e.code == 'INVALID_PASSWORD') return 'كلمة المرور غير صحيحة.';
    if (e.code == 'ADMIN_ACCOUNT') return 'حساب إداري: يُزال من لوحة الإدارة أولاً.';
    if (e.code == 'PDF_UNAVAILABLE') return 'تصدير PDF غير متاح الآن. جرّب Word.';
    if (e.status == 429) return errorsAr['RATE_LIMITED'] ?? 'طلبات كثيرة. انتظر قليلاً.';
    if (e.forbidden) return 'حسابك غير مفعّل لهذه الخدمة.';
    if (e.unauthorized) return 'انتهت الجلسة. سجّل الدخول من جديد.';
    if (e.status >= 500) return 'الخادم مشغول الآن. حاول بعد قليل.';
    return errorsAr['GENERIC'] ?? 'حدث خطأ. حاول مرة أخرى.';
  }
  return 'تعذّر الاتصال بالخادم. تأكد من الإنترنت.';
}

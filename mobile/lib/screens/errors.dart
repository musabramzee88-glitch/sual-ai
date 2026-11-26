import '../api/client.dart';

/// رسائل عربية لرموز أخطاء الخادم (لا نعرض رموزاً خاماً للمدرس)
String messageOf(Object e) {
  if (e is ApiError) {
    const m = {
      'INVALID_CREDENTIALS': 'البريد أو كلمة المرور غير صحيحة.',
      'INVALID_CODE': 'الرمز غير صحيح.',
      'CODE_EXPIRED': 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.',
      'TOO_MANY_ATTEMPTS': 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.',
      'OTP_COOLDOWN': 'انتظر قليلاً قبل طلب رمز جديد.',
      'NO_CHANNEL_AVAILABLE': 'تعذّر إرسال الرمز الآن.',
      'ACCOUNT_RESTRICTED': 'هذا الحساب موقوف.',
      'NOT_FOUND': 'لم يُعثر عليه.',
      'PDF_UNAVAILABLE': 'تصدير PDF غير متاح الآن. جرّب Word.',
    };
    if (m.containsKey(e.code)) return m[e.code]!;
    if (e.status == 429) return 'محاولات كثيرة. انتظر قليلاً.';
    if (e.forbidden) return 'حسابك غير مفعّل لهذه الخدمة.';
    if (e.unauthorized) return 'انتهت الجلسة. سجّل الدخول من جديد.';
    return 'حدث خطأ (${e.status}). حاول مرة أخرى.';
  }
  return 'تعذّر الاتصال بالخادم. تأكد من الإنترنت.';
}

import "server-only";
export interface SmsSender {
  send(msg: { to: string; text: string }): Promise<void>;
}

export class SmsUnavailableError extends Error {
  constructor(msg = "SMS provider is not configured") {
    super(msg);
  }
}

/**
 * لا يوجد مزوّد SMS منفَّذ بعد (المرحلة 5: يُختار مزوّد عراقي). إلى ذلك الحين تُرفض كل المحاولات
 * بخطأ صريح، ولا يُدَّعى إرسال أي رسالة لم تُرسَل فعلاً.
 */
class UnconfiguredSms implements SmsSender {
  async send(): Promise<void> {
    throw new SmsUnavailableError();
  }
}

let current: SmsSender | undefined;
export const getSmsSender = (): SmsSender => (current ??= new UnconfiguredSms());

/** هل قناة الهاتف متاحة فعلاً؟ (مزوّد مركّب ومضبوط) */
export const smsAvailable = (): boolean => !!current && !(current instanceof UnconfiguredSms);

/** لتركيب مزوّد حقيقي لاحقاً، ولاستعمال مرسِل وهمي في الاختبارات فقط */
export const setSmsSender = (s: SmsSender | undefined) => {
  current = s;
};

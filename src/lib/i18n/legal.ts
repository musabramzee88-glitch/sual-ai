/**
 * الشروط والخصوصية والتواصل (نصوص ثابتة بالعربية والإنكليزية).
 * القيم المتغيرة (التواصل، أيام الاسترجاع) تأتي من الإعدادات (SUPPORT_EMAIL، SUPPORT_WHATSAPP، REFUND_DAYS) لا من الكود.
 * أي تعديل في البيانات المخزَّنة أو الجهات الخارجية (Gemini، البريد، بوابة الدفع) يجب أن يُعكس في «الخصوصية».
 */
import type { Locale } from "./dictionaries";

export type LegalConfig = { email: string | null; whatsapp: string | null; refundDays: number; updated: string };
export type LegalBlock = { h: string; p?: string[]; list?: string[] };
export type LegalDoc = { title: string; intro: string; blocks: LegalBlock[] };
export type LegalKind = "terms" | "privacy" | "contact";

const contactLine = (c: LegalConfig, ar: boolean) => {
  const parts = [c.email && (ar ? `البريد: ${c.email}` : `Email: ${c.email}`), c.whatsapp && (ar ? `واتساب: ${c.whatsapp}` : `WhatsApp: ${c.whatsapp}`)].filter(Boolean);
  return parts.length ? parts.join(" · ") : ar ? "من صفحة «تواصل معنا»." : "via the Contact page.";
};

function ways(c: LegalConfig, labels: [string, string], none: string): string[] {
  const out = [c.email && `${labels[0]}: ${c.email}`, c.whatsapp && `${labels[1]}: ${c.whatsapp}`].filter((x): x is string => !!x);
  return out.length ? out : [none];
}

function refundAr(d: number) {
  return d > 0
    ? [`يمكنك طلب استرجاع المبلغ خلال (${d}) أيام من تفعيل الاشتراك إن لم تكن الخدمة مناسبة لك، ويُعاد بالطريقة نفسها التي دفعت بها بعد خصم رسوم بوابة الدفع إن وُجدت.`, "بعد هذه المدة لا يُسترد المبلغ، إلا إن تعذّر تقديم الخدمة بسبب خلل من المنصة، فنمدّد اشتراكك بقدر مدة التعطّل أو نعيد ما يقابلها."]
    : ["لا يُسترد مبلغ الاشتراك بعد تفعيله، لأن الخدمة تُستهلك فور التفعيل (توليد الامتحانات يكلّف المنصة فعلياً).", "إن تعذّر تقديم الخدمة بسبب خلل من المنصة، نمدّد اشتراكك بقدر مدة التعطّل أو نعيد ما يقابلها."];
}
function refundEn(d: number) {
  return d > 0
    ? [`You may request a refund within ${d} days of activation if the service does not suit you. It is returned through the original payment method, minus any gateway fees.`, "After that period subscriptions are non-refundable, except when the service could not be provided due to a fault on our side, in which case we extend your subscription by the downtime or refund the equivalent."]
    : ["Subscriptions are non-refundable once activated, because the service is consumed immediately (every generated exam has a real cost).", "If the service could not be provided due to a fault on our side, we extend your subscription by the downtime or refund the equivalent."];
}

export function legalDoc(kind: LegalKind, locale: Locale, c: LegalConfig): LegalDoc {
  const ar = locale === "ar";
  const contact = contactLine(c, ar);
  if (kind === "terms") {
    return ar ? {
      title: "شروط الاستخدام",
      intro: `آخر تحديث: ${c.updated}. باستخدامك منصة «سُؤال AI» أو إنشاء حساب فيها فإنك توافق على هذه الشروط.`,
      blocks: [
        { h: "١. الخدمة", p: ["«سُؤال AI» منصة تساعد المدرسين على إعداد أسئلة الامتحانات من الكتب المدرسية المقررة باستخدام الذكاء الاصطناعي، مع الإجابات النموذجية وتوزيع الدرجات وتصدير الورقة (PDF وWord)."] },
        { h: "٢. مراجعة المدرس واجبة", p: ["الأسئلة والإجابات يولّدها الذكاء الاصطناعي، وقد تحتوي أخطاء في المعلومة أو الصياغة أو الأرقام. المدرس مسؤول عن مراجعة كل سؤال وإجابة وتعديلها قبل استعمالها أو طباعتها.", "النصوص المنقولة حرفياً (الآيات والأحاديث والأبيات) تتحقق منها المنصة آلياً حين يكون نص الكتاب مقروءاً، ويجب مطابقتها بالكتاب في كل الأحوال."] },
        { h: "٣. الحساب", list: ["الحساب شخصي لمدرس واحد، ولا يجوز مشاركته أو بيعه أو استعماله من أكثر من شخص.", "أنت مسؤول عن سرية كلمة المرور وعن كل ما يجري من حسابك.", "يجب أن تكون بيانات التسجيل صحيحة (الاسم والبريد ورقم الهاتف)."] },
        { h: "٤. الاشتراك والدفع", list: ["الخدمات المدفوعة تعمل باشتراك فعّال لمدة الباقة المختارة، ويبدأ من تاريخ التفعيل.", "الدفع نقداً عبر طلب تؤكده الإدارة، أو بالبطاقة عبر بوابة دفع معتمدة. لا تحفظ المنصة بيانات بطاقتك.", "الأسعار بالدينار العراقي، وقد تتغير للاشتراكات الجديدة دون أن تؤثر على اشتراك قائم."] },
        { h: "٥. الاسترجاع", p: refundAr(c.refundDays) },
        { h: "٦. الاستعمال المقبول", list: ["لا يجوز محاولة الوصول إلى حسابات الآخرين أو امتحاناتهم، أو تعطيل المنصة، أو تجاوز حدود الاستعمال آلياً.", "لا يجوز استعمال المنصة لإنتاج محتوى مخالف للقانون أو مسيء.", "عند المخالفة يحق لنا إيقاف الحساب، وفي المخالفات الجسيمة دون استرجاع."] },
        { h: "٧. المحتوى والملكية", p: ["الامتحانات التي تنشئها ملك لك وتستعملها في عملك التعليمي بحرية. الكتب المدرسية ملك جهاتها الرسمية، وتُستعمل في المنصة مصدراً لإعداد الأسئلة فقط.", "تصميم المنصة وشعارها وبرمجتها ملك «سُؤال AI»."] },
        { h: "٨. حدود المسؤولية", p: ["نبذل جهدنا لتكون الخدمة متاحة ودقيقة، لكنها تُقدَّم «كما هي». لا نتحمل مسؤولية أي ضرر ناتج عن استعمال أسئلة لم يراجعها المدرس، أو عن انقطاع خارج عن إرادتنا. وفي كل الأحوال لا تتجاوز مسؤوليتنا قيمة اشتراكك الحالي."] },
        { h: "٩. التعديل والتواصل", p: ["قد نعدّل هذه الشروط، ونعلن ذلك في المنصة قبل سريانه على الاشتراكات الجديدة. تخضع هذه الشروط لقوانين جمهورية العراق.", `للاستفسار: ${contact}`] },
      ],
    } : {
      title: "Terms of Use",
      intro: `Last updated: ${c.updated}. By using Sual AI or creating an account you agree to these terms.`,
      blocks: [
        { h: "1. The service", p: ["Sual AI helps teachers prepare exam questions from the official textbooks using AI, with model answers, mark distribution and export to PDF and Word."] },
        { h: "2. Teacher review is required", p: ["Questions and answers are AI-generated and may contain factual, wording or numerical mistakes. The teacher is responsible for reviewing and correcting every question and answer before use.", "Verbatim texts (Quran verses, hadith, poetry) are checked automatically when the book text is readable, and must always be compared with the book."] },
        { h: "3. Your account", list: ["An account belongs to one teacher and may not be shared, sold or used by several people.", "You are responsible for keeping your password secret and for all activity on your account.", "Registration details (name, email, phone) must be accurate."] },
        { h: "4. Subscription and payment", list: ["Paid features require an active subscription for the chosen plan period, starting at activation.", "Payment is in cash through a request confirmed by the administration, or by card through an approved payment gateway. We never store card details.", "Prices are in Iraqi dinars and may change for new subscriptions without affecting an active one."] },
        { h: "5. Refunds", p: refundEn(c.refundDays) },
        { h: "6. Acceptable use", list: ["Do not attempt to access other users' accounts or exams, disrupt the platform, or bypass usage limits automatically.", "Do not use the platform to produce unlawful or abusive content.", "Violations may lead to suspension, and serious ones without a refund."] },
        { h: "7. Content and ownership", p: ["Exams you create are yours to use freely in your teaching. Textbooks belong to their official publishers and are used only as a source for preparing questions.", "The platform's design, logo and software belong to Sual AI."] },
        { h: "8. Liability", p: ["We work to keep the service available and accurate, but it is provided \"as is\". We are not liable for harm caused by using questions the teacher did not review, or for outages beyond our control. In any case our liability does not exceed the value of your current subscription."] },
        { h: "9. Changes and contact", p: ["We may update these terms and will announce changes in the platform before they apply to new subscriptions. These terms are governed by the laws of the Republic of Iraq.", `Questions: ${contact}`] },
      ],
    };
  }
  if (kind === "privacy") {
    return ar ? {
      title: "سياسة الخصوصية",
      intro: `آخر تحديث: ${c.updated}. نجمع أقل ما يلزم لتقديم الخدمة، ولا نبيع بياناتك لأي جهة.`,
      blocks: [
        { h: "ما نجمعه", list: ["بيانات الحساب: الاسم والبريد الإلكتروني ورقم الهاتف وكلمة المرور (مشفّرة بطريقة لا يمكن استرجاعها حتى من قبلنا).", "بيانات العمل: الامتحانات التي تنشئها وتعديلاتك عليها، والقوالب والشعارات والصور التي ترفعها.", "بيانات الاشتراك: الباقة وحالة الدفع والمبلغ ومرجع العملية. لا نحفظ بيانات البطاقة؛ تستلمها بوابة الدفع مباشرة.", "بيانات الأمان: عنوان IP ونوع المتصفح عند الدخول، لحماية حسابك وكشف المحاولات المشبوهة."] },
        { h: "لماذا نستعملها", list: ["لتشغيل حسابك وحفظ امتحاناتك وتصديرها.", "للتحقق من هويتك برموز الدخول (OTP) وحماية الحساب.", "لتفعيل الاشتراك ومتابعة المدفوعات.", "لإبلاغك بما يخص حسابك واشتراكك فقط، لا رسائل تسويقية دون موافقتك."] },
        { h: "الجهات التي تمر بها البيانات", list: ["الذكاء الاصطناعي (Google Gemini): تُرسل إليه صفحات الكتاب المختارة وتعليمات التوليد فقط، دون اسمك أو بياناتك الشخصية.", "خدمة البريد الإلكتروني: لإرسال رموز التحقق إلى بريدك.", "بوابة الدفع: عند الدفع بالبطاقة، وفق سياستها الخاصة.", "لا نشارك بياناتك مع أي جهة أخرى إلا إذا ألزمنا القانون العراقي بذلك."] },
        { h: "ملفات الارتباط (Cookies)", p: ["نستعمل ملفات ضرورية فقط: جلسة الدخول، والجهاز الموثوق (إن اخترته)، ولغة الواجهة. لا نستعمل ملفات تتبّع أو إعلانات."] },
        { h: "الحماية والاحتفاظ", list: ["الاتصال مشفّر (HTTPS)، وكلمات المرور والرموز تُخزَّن مشفّرة، ولكل امتحان صاحب واحد لا يراه غيره.", "نحتفظ بنسخ احتياطية يومية لحماية عملك من الضياع.", "نحتفظ ببياناتك ما دام حسابك قائماً؛ وعند طلب حذف الحساب نحذف بياناتك الشخصية وامتحاناتك، ونبقي سجلات الدفع المطلوبة قانونياً فقط."] },
        { h: "حقوقك", p: ["يمكنك طلب نسخة من بياناتك أو تصحيحها أو حذف حسابك بالتواصل معنا.", `التواصل: ${contact}`] },
      ],
    } : {
      title: "Privacy Policy",
      intro: `Last updated: ${c.updated}. We collect the minimum needed to provide the service and never sell your data.`,
      blocks: [
        { h: "What we collect", list: ["Account data: name, email, phone and password (hashed so that it cannot be recovered, even by us).", "Your work: exams you create and your edits, and the templates, logos and images you upload.", "Subscription data: plan, payment status, amount and reference. We never store card details; the payment gateway receives them directly.", "Security data: IP address and browser type at sign-in, to protect your account and detect suspicious attempts."] },
        { h: "Why we use it", list: ["To run your account and store and export your exams.", "To verify your identity with one-time codes and protect your account.", "To activate subscriptions and track payments.", "To contact you about your account and subscription only; no marketing without your consent."] },
        { h: "Who processes it", list: ["AI (Google Gemini): receives only the selected textbook pages and generation instructions, never your name or personal data.", "Email service: to deliver verification codes.", "Payment gateway: when paying by card, under its own policy.", "We share data with no one else unless required by Iraqi law."] },
        { h: "Cookies", p: ["Only essential cookies: your sign-in session, a trusted device (if you choose it) and the interface language. No tracking or advertising cookies."] },
        { h: "Security and retention", list: ["Connections are encrypted (HTTPS), passwords and codes are stored hashed, and each exam is visible to its owner only.", "We keep daily backups to protect your work.", "We keep your data while your account exists; when you ask us to delete it we remove your personal data and exams, keeping only payment records required by law."] },
        { h: "Your rights", p: ["You can ask for a copy of your data, correct it, or delete your account by contacting us.", `Contact: ${contact}`] },
      ],
    };
  }
  return ar ? {
    title: "تواصل معنا",
    intro: "لأي سؤال عن حسابك أو اشتراكك أو الدفع، أو لإبلاغنا بخطأ في سؤال أو منهج.",
    blocks: [
      { h: "طرق التواصل", list: ways(c, ["البريد الإلكتروني", "واتساب"], "ستُضاف طرق التواصل قريباً.") },
      { h: "لتسريع الرد", list: ["اذكر البريد أو رقم الهاتف المسجّل في حسابك.", "لمشكلة في الدفع: اذكر رقم العملية (المرجع) الظاهر في صفحة الاشتراك.", "لخطأ في امتحان: اذكر عنوان الامتحان ورقم السؤال."] },
      { h: "تنبيه", p: ["لن نطلب منك أبداً كلمة المرور أو رمز التحقق (OTP) أو بيانات بطاقتك. لا تشاركها مع أي شخص يدّعي أنه من «سُؤال AI»."] },
    ],
  } : {
    title: "Contact us",
    intro: "For anything about your account, subscription or payment, or to report a mistake in a question or curriculum.",
    blocks: [
      { h: "How to reach us", list: ways(c, ["Email", "WhatsApp"], "Contact details will be added soon.") },
      { h: "To help us reply faster", list: ["Mention the email or phone registered on your account.", "For payment issues: include the transaction reference shown on the subscription page.", "For a mistake in an exam: include the exam title and question number."] },
      { h: "Warning", p: ["We will never ask for your password, verification code (OTP) or card details. Do not share them with anyone claiming to be from Sual AI."] },
    ],
  };
}

export const LEGAL_LINKS: Record<Locale, { terms: string; privacy: string; contact: string; agree: string }> = {
  ar: { terms: "الشروط", privacy: "الخصوصية", contact: "تواصل معنا", agree: "بإنشاء حساب فإنك توافق على" },
  en: { terms: "Terms", privacy: "Privacy", contact: "Contact", agree: "By creating an account you agree to the" },
};

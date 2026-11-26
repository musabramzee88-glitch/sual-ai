// مولَّد تلقائياً من الموقع (scripts/gen-mobile-catalog.ts). لا تعدّله يدوياً.
// ignore_for_file: constant_identifier_names

class QType {
  const QType(this.code, this.ar, this.en, this.instAr);
  final String code;
  final String ar;
  final String en;
  final String instAr;
}

const qTypes = <String, QType>{
  'MCQ': QType('MCQ', 'اختيار من متعدد', 'Multiple choice', 'اختر الإجابة الصحيحة لكل مما يأتي:'),
  'TRUE_FALSE': QType('TRUE_FALSE', 'صح وخطأ مع التصحيح', 'True / False', 'ضع كلمة (صح) أمام العبارة الصحيحة وكلمة (خطأ) أمام العبارة الخاطئة مع تصحيح الخطأ:'),
  'FILL_BLANK': QType('FILL_BLANK', 'املأ الفراغ', 'Fill in the blank', 'املأ الفراغات الآتية بما يناسبها:'),
  'MATCHING': QType('MATCHING', 'صِل بين العمودين', 'Matching', 'صِل بين العمود (أ) وما يناسبه من العمود (ب):'),
  'DEFINE': QType('DEFINE', 'عرّف', 'Define', 'عرّف ما يأتي:'),
  'JUSTIFY': QType('JUSTIFY', 'علّل', 'Give reasons', 'علّل ما يأتي:'),
  'COMPARE': QType('COMPARE', 'قارن', 'Compare', 'قارن بين ما يأتي:'),
  'LIST': QType('LIST', 'عدّد / اذكر', 'List', 'عدّد ما يأتي:'),
  'WHAT_IF': QType('WHAT_IF', 'ماذا يحدث لو', 'What happens if', 'ماذا يحدث في الحالات الآتية؟'),
  'ESSAY': QType('ESSAY', 'أسئلة مقالية', 'Essay', 'أجب عن الأسئلة الآتية:'),
  'APPLIED': QType('APPLIED', 'تطبيقية', 'Applied', 'أجب عن الأسئلة التطبيقية الآتية:'),
  'COMPREHENSION': QType('COMPREHENSION', 'فهم واستيعاب', 'Comprehension', 'اقرأ ثم أجب:'),
  'COMPUTE': QType('COMPUTE', 'جد الناتج', 'Calculate', 'جد ناتج ما يأتي:'),
  'PROBLEM': QType('PROBLEM', 'مسائل', 'Problems', 'حلّ المسائل الآتية:'),
  'PROOF': QType('PROOF', 'إثبات / اشتقاق', 'Proof / derivation', 'أثبت ما يأتي:'),
  'EQUATION_BALANCING': QType('EQUATION_BALANCING', 'معادلات كيميائية', 'Chemical equations', 'اكتب المعادلات الكيميائية الآتية ووازنها:'),
  'DIAGRAM': QType('DIAGRAM', 'رسومات وأشكال', 'Diagrams', 'أجب مستعيناً بالأشكال:'),
  'ALGORITHM': QType('ALGORITHM', 'خوارزمية / برنامج', 'Algorithm / program', 'اكتب خوارزمية (أو برنامجاً) لما يأتي:'),
  'COMPLETE_VERSE': QType('COMPLETE_VERSE', 'أكمل الآيات الكريمة', 'Complete the verses', 'أكمل الآيات الكريمة الآتية:'),
  'WRITE_VERSE': QType('WRITE_VERSE', 'اكتب الآيات الكريمة', 'Write the verses', 'اكتب الآيات الكريمة الآتية:'),
  'EXPLAIN_VERSE': QType('EXPLAIN_VERSE', 'فسّر / وضّح المعنى', 'Explain', 'وضّح ما يُفهم من كل مما يأتي:'),
  'WRITE_HADITH': QType('WRITE_HADITH', 'اذكر الحديث الشريف', 'Write the hadith', 'اكتب الحديث الشريف الذي يدل على كل مما يأتي:'),
  'TAJWEED': QType('TAJWEED', 'أحكام التلاوة', 'Tajweed rules', 'بيّن حكم التلاوة فيما يأتي:'),
  'LESSONS': QType('LESSONS', 'ما يُستفاد', 'Lessons learned', 'ما الذي تستفيده مما يأتي؟'),
  'SITUATION': QType('SITUATION', 'مواقف (ماذا تفعل)', 'Situations', 'ماذا تفعل في المواقف الآتية؟'),
  'WORD_MEANINGS': QType('WORD_MEANINGS', 'معاني الكلمات', 'Word meanings', 'هات معاني الكلمات الآتية:'),
  'WORD_FORMS': QType('WORD_FORMS', 'المفرد والجمع والضد', 'Word forms', 'هات ما يُطلب منك:'),
  'COMPLETE_POEM': QType('COMPLETE_POEM', 'أكمل الأبيات (المحفوظات)', 'Complete the poem', 'أكمل الأبيات الآتية:'),
  'GRAMMAR_PARSING': QType('GRAMMAR_PARSING', 'إعراب', 'Parsing (إعراب)', 'أعرب ما بين القوسين:'),
  'EXTRACT': QType('EXTRACT', 'استخرج', 'Extract', 'استخرج مما يأتي ما هو مطلوب:'),
  'CONVERT': QType('CONVERT', 'حوّل', 'Change as required', 'حوّل الجمل الآتية كما هو مطلوب بين القوسين:'),
  'CORRECT_ERROR': QType('CORRECT_ERROR', 'صحّح الخطأ', 'Correct the mistake', 'صحّح الخطأ في الجمل الآتية:'),
  'WRITING': QType('WRITING', 'التعبير / الإنشاء', 'Writing', 'اكتب موضوعاً تعبيرياً في واحد مما يأتي:'),
  'REORDER': QType('REORDER', 'رتّب الكلمات', 'Put in order', 'رتّب الكلمات الآتية لتكوّن جملاً مفيدة:'),
  'VERB_FORMS': QType('VERB_FORMS', 'صيغة الفعل الصحيحة', 'Verb forms', 'اكتب الفعل بالصيغة الصحيحة:'),
  'WHO_SAID': QType('WHO_SAID', 'من القائل؟ ولمن؟', 'Who said it?', 'من القائل؟ ولمن قال؟ وفي أي مناسبة؟'),
  'SURAH_RANGE': QType('SURAH_RANGE', 'أكمل السورة من الآية … إلى الآية … (المحفوظ)', 'Complete the surah from verse … to verse … (memorisation)', 'أكمل السور الآتية من الآية إلى الآية المحدّدة:'),
};

const generatableTypes = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING', 'DEFINE', 'JUSTIFY', 'COMPARE', 'LIST', 'WHAT_IF', 'ESSAY', 'APPLIED', 'COMPREHENSION', 'COMPUTE', 'PROBLEM', 'PROOF', 'EQUATION_BALANCING', 'ALGORITHM', 'COMPLETE_VERSE', 'WRITE_VERSE', 'EXPLAIN_VERSE', 'WRITE_HADITH', 'TAJWEED', 'LESSONS', 'SITUATION', 'WORD_MEANINGS', 'WORD_FORMS', 'COMPLETE_POEM', 'GRAMMAR_PARSING', 'EXTRACT', 'CONVERT', 'CORRECT_ERROR', 'WRITING', 'REORDER', 'VERB_FORMS', 'WHO_SAID', 'SURAH_RANGE'];
const verbatimTypes = ['COMPLETE_VERSE', 'WRITE_VERSE', 'WRITE_HADITH', 'COMPLETE_POEM', 'SURAH_RANGE'];
const headerKeys = ['republic', 'ministry', 'directorate', 'school', 'title', 'subject', 'grade', 'examKind', 'round', 'yearTerm', 'teacher', 'time', 'total', 'model', 'student', 'section', 'date', 'examNumber'];
const hiddenByDefault = ['teacher', 'round', 'date', 'model', 'examNumber'];
const headerLabelsAr = {'republic': 'جمهورية العراق', 'ministry': 'وزارة التربية', 'directorate': 'المديرية العامة للتربية', 'school': 'المدرسة', 'title': 'عنوان الامتحان', 'subject': 'المادة', 'grade': 'الصف', 'examKind': 'نوع الامتحان', 'round': 'الدور', 'yearTerm': 'العام الدراسي', 'teacher': 'المدرس', 'time': 'الزمن', 'total': 'الدرجة', 'model': 'النموذج', 'student': 'اسم الطالب', 'section': 'الشعبة', 'date': 'التاريخ', 'examNumber': 'الرقم الامتحاني'};
const fonts = ['Traditional Arabic', 'Simplified Arabic', 'Arial', 'Tahoma', 'Times New Roman', 'Sakkal Majalla', 'IBM Plex Sans Arabic', 'Noto Naskh Arabic'];
const accents = ['#1e40af', '#047857', '#7c2d12', '#9f1239', '#4c1d95'];
const layouts = ['CLASSIC', 'SCHOOL', 'ACADEMIC', 'MINIMAL'];
const layoutNamesAr = {'CLASSIC': 'كلاسيكي', 'SCHOOL': 'مدرسي', 'ACADEMIC': 'أكاديمي', 'MINIMAL': 'بسيط'};
const examKinds = {'QUIZ': 'اختبار قصير', 'MONTHLY': 'امتحان شهري', 'MIDTERM': 'نصف السنة', 'FINAL': 'نهاية السنة', 'MINISTERIAL_STYLE': 'بأسلوب الوزاري'};
const difficulties = {'MIXED': 'متنوعة', 'EASY': 'سهلة', 'MEDIUM': 'متوسطة', 'HARD': 'صعبة'};
/** رسائل الأخطاء (الحساب + الامتحانات + القوالب) كما في الموقع */
const errorsAr = {'PDF_UNAVAILABLE': 'تعذّر تشغيل متصفح لإنشاء PDF على الخادم. ثبّت Edge أو Chrome أو ضع CHROMIUM_PATH في ‎.env‎.', 'PDF_FAILED': 'تعذّر إنشاء PDF. حاول مرة أخرى.', 'RATE_LIMITED': 'طلبات كثيرة متتالية. انتظر دقيقة ثم حاول.', 'TEMPLATE_NOT_FOUND': 'القالب غير موجود.', 'LOGO_NOT_FOUND': 'الشعار غير موجود.', 'TOO_MANY_TEMPLATES': 'وصلت للحد الأقصى (30 قالباً).', 'TOO_MANY_LOGOS': 'وصلت للحد الأقصى من الشعارات (20).', 'FILE_TOO_LARGE': 'الصورة أكبر من 2MB.', 'UNSUPPORTED_FILE': 'الصورة يجب أن تكون PNG أو JPEG.', 'VALIDATION_ERROR': 'تحقق من الحقول المدخلة.', 'GENERIC': 'حدث خطأ. حاول مرة أخرى.', 'SMS_UNAVAILABLE': 'خدمة الرسائل (SMS) غير متاحة حالياً. استعمل التحقق بالبريد.', 'NO_CHANNEL_AVAILABLE': 'لا توجد قناة تحقق متاحة الآن (الهاتف غير متاح حالياً). حاول لاحقاً.', 'ACCOUNT_UNVERIFIED': 'أكّد حسابك أولاً.', 'BOTH_NOT_VERIFIED': 'أكّد البريد والهاتف كليهما أولاً.', 'ALREADY_VERIFIED': 'هذه القناة مؤكَّدة مسبقاً.', 'EMAIL_TAKEN': 'هذا البريد مسجّل مسبقاً.', 'PHONE_TAKEN': 'هذا الهاتف مسجّل مسبقاً.', 'INVALID_PHONE': 'رقم هاتف عراقي غير صالح (مثال 07701234567).', 'WEAK_PASSWORD': 'كلمة المرور ضعيفة: 10 أحرف على الأقل مع حرف ورقم.', 'PASSWORD_MISMATCH': 'كلمتا المرور غير متطابقتين.', 'INVALID_DIRECTORATE': 'المديرية لا تتبع المحافظة المختارة.', 'INVALID_CREDENTIALS': 'بيانات الدخول غير صحيحة.', 'LOCKED': 'الحساب مقفل مؤقتاً بسبب محاولات فاشلة. حاول لاحقاً.', 'ACCOUNT_BANNED': 'هذا الحساب محظور.', 'INVALID': 'الرمز غير صحيح.', 'EXPIRED': 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.', 'TOO_MANY_ATTEMPTS': 'تجاوزت عدد المحاولات. اطلب رمزاً جديداً.', 'OTP_COOLDOWN': 'انتظر قليلاً قبل طلب رمز جديد.', 'EMAIL_UNAVAILABLE': 'خدمة البريد غير متاحة حالياً. حاول لاحقاً.', 'INVALID_TOKEN': 'رابط الاستعادة غير صالح أو منتهٍ.', 'AI_QUOTA': 'انتهت الحصة اليومية لخدمة الذكاء الاصطناعي. حاول لاحقاً.', 'AI_UNAVAILABLE': 'خدمة الذكاء الاصطناعي غير مهيأة على الخادم.', 'NO_VALID_QUESTIONS': 'لم يُنتج سؤال صالح من صفحات المصدر لهذا النوع (مثلاً لا آيات/أحاديث في هذه الصفحات، أو لم تطابق نص الكتاب حرفياً). جرّب نوعاً آخر أو وسّع نطاق الصفحات أو أضفه بنفسك.', 'AI_FAILED': 'تعذّر توليد الأسئلة الآن (الخدمة مشغولة أو الرد غير صالح). حاول مرة أخرى.', 'TYPE_NOT_ALLOWED': 'نوع سؤال غير متاح لهذه المادة.', 'PAGE_OUT_OF_RANGE': 'الصفحات خارج نطاق الكتاب.', 'NO_BOOK': 'لا يوجد كتاب جاهز لهذا المنهج.', 'CHAPTER_NOT_FOUND': 'فصل غير موجود أو بلا صفحات.', 'SOURCE_REQUIRED': 'حدّد الفصول أو نطاق الصفحات.', 'TOO_MANY_QUESTIONS': 'الحد الأقصى 40 سؤالاً.', 'DUPLICATE_SECTION': 'لا تكرر نوع السؤال في قسمين.', 'SUBSCRIPTION_REQUIRED': 'يتطلب اشتراكاً فعالاً.', 'SUBSCRIPTION_EXPIRED': 'انتهى اشتراكك.', 'NOTHING_TO_UNDO': 'لا يوجد تغيير للتراجع عنه.', 'ANSWER_NOT_IN_OPTIONS': 'الإجابة يجب أن تطابق أحد الخيارات.', 'TOO_MANY_IMAGES': 'وصلت للحد الأقصى من الصور (300).', 'TOO_MANY': 'وصلت للحد الأقصى من الأسئلة في الامتحان.', 'BAD_COUNT': 'العدد غير صالح: يجب أن يُترك سؤال واحد على الأقل ويُجاب عن واحد على الأقل.', 'TOTAL_TOO_SMALL': 'الدرجة الكلية صغيرة جداً لعدد الفروع.', 'BAD_ORDER': 'تغيّر الامتحان، حدّث الصفحة.', 'SOURCE_MISSING': 'مصدر الامتحان غير متاح.'};
/** حالة الحساب (resolveAccess) */
const accessStatesAr = {'UNVERIFIED': 'بانتظار التحقق من البريد والهاتف', 'AWAITING_PAYMENT': 'بانتظار الاشتراك والدفع', 'AWAITING_APPROVAL': 'بانتظار موافقة الإدارة', 'SUBSCRIPTION_ACTIVE': 'اشتراك فعال', 'SUBSCRIPTION_EXPIRED': 'الاشتراك منتهٍ', 'SUBSCRIPTION_SUSPENDED': 'الاشتراك موقوف', 'ACCOUNT_SUSPENDED': 'الحساب موقوف', 'BANNED': 'الحساب محظور'};

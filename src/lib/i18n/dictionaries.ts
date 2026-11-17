export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";
export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");

const ar = {
  brand: "سُؤال AI",
  nav: { features: "المزايا", curricula: "المناهج", how: "كيف تعمل", pricing: "الاشتراك", login: "تسجيل الدخول", register: "إنشاء حساب" },
  hero: {
    badge: "منصة امتحانات للمدرس العراقي",
    title: "امتحانات احترافية من منهجك، بدقائق لا بساعات",
    subtitle: "ارفع كتاب المادة، حدّد الفصول والصفحات، ودع الذكاء الاصطناعي يصوغ أسئلة بأسلوب الامتحانات العراقية مع الإجابات النموذجية وتوزيع الدرجات — ثم راجعها وعدّلها قبل الطباعة.",
    cta: "ابدأ الآن",
    secondary: "استعرض المناهج المدعومة",
    note: "المنصة مدفوعة بالكامل — تُفعَّل الحسابات بعد تأكيد الاشتراك من الإدارة.",
  },
  paper: {
    sample: "مثال توضيحي للتصميم",
    republic: "جمهورية العراق",
    ministry: "وزارة التربية",
    directorate: "المديرية العامة للتربية",
    subject: "المادة: الرياضيات",
    grade: "الصف: الثالث المتوسط",
    time: "الزمن: ساعتان",
    model: "النموذج A",
    q1: "س١: أجب عن خمسة فقط مما يأتي:",
    q1a: ["أ) أوجد ناتج", "(2x − 3)(x + 4)"] as [string, string],
    q1b: ["ب) حلّ المعادلة", "x² − 5x + 6 = 0"] as [string, string],
    q2: "س٢: اختر الإجابة الصحيحة:",
    marks: "١٠ درجات",
  },
  curricula: {
    title: "كل المناهج العراقية في مكان واحد",
    subtitle: "المنهج العام، مدارس المتميزين، والمنهج الدولي — بمراحلها وصفوفها وفروعها كما هي في النظام العراقي.",
    tryTitle: "جرّب اختيار الصف",
    stage: "المرحلة",
    grade: "الصف",
    track: "المنهج",
    branch: "الفرع",
    choose: "اختر…",
    none: "لا يوجد",
    loading: "جارٍ التحميل…",
    error: "تعذّر تحميل البيانات. حاول مرة أخرى.",
    gradesCount: (n: number) => `${n} صفوف`,
  },
  how: {
    title: "كيف تعمل",
    steps: [
      ["حدّد الامتحان", "المرحلة، الصف، المنهج، المادة، الفصول ونطاق الصفحات وعدد الأسئلة والدرجات."],
      ["ارفع الكتاب", "ملف PDF للمنهج — يستخرج النظام النص ويحلل الموضوعات والمفاهيم."],
      ["التوليد بالذكاء الاصطناعي", "أسئلة أصلية من المنهج بأسلوب الامتحانات العراقية مع الإجابات والدرجات."],
      ["راجع وصدّر", "عدّل في المحرر، اختر القالب والترويسة، ثم صدّر PDF أو Word بنماذج A/B/C/D."],
    ],
  },
  features: {
    title: "صُمّمت لما يحتاجه المدرس فعلاً",
    items: [
      ["أسلوب الامتحان العراقي", "علّل، عرّف، قارن، أعرب، أثبت أن، وازن المعادلة — صياغة تختلف حسب المادة والصف."],
      ["نماذج متكافئة A/B/C/D", "نماذج بنفس الصعوبة والتوزيع والموضوعات، لا مجرد تغيير أرقام."],
      ["محرر أسئلة متكامل", "تعديل، فروع، نقل، قفل، إعادة صياغة أو توليد، وسجل كامل للتعديلات."],
      ["قوالب وترويسات", "رسمي، مدرسي، أكاديمي، بسيط — مع شعار المدرسة وحقول قابلة للإظهار والإخفاء."],
      ["تصدير جاهز للطباعة", "PDF وWord قابل للتحرير، نسخة الأسئلة ونسخة الإجابات، وملف ZIP للنماذج."],
      ["أمان وخصوصية", "تحقق من البريد والهاتف، صلاحيات على مستوى الخادم، ولا نخزّن بيانات البطاقات."],
    ],
  },
  pricing: {
    title: "الاشتراك",
    subtitle: "لا توجد باقة مجانية. الدفع ببطاقة Mastercard أو نقداً، ويُفعَّل الاشتراك بعد تأكيد الإدارة.",
    perDays: (d: number) => `لمدة ${d} يوماً`,
    iqd: "د.ع",
    empty: "ستُعلَن باقات الاشتراك قريباً.",
  },
  footer: { rights: "جميع الحقوق محفوظة.", disclaimer: "سُؤال AI منصة مستقلة وغير تابعة لوزارة التربية." },
  soon: { title: "قيد الإنشاء", body: "هذه الصفحة تُفتح في المرحلة القادمة من إطلاق المنصة.", back: "العودة للرئيسية" },
  langSwitch: "English",
};

export type Dictionary = typeof ar;

const en: Dictionary = {
  brand: "Sual AI",
  nav: { features: "Features", curricula: "Curricula", how: "How it works", pricing: "Pricing", login: "Log in", register: "Sign up" },
  hero: {
    badge: "Exam platform for Iraqi teachers",
    title: "Professional exams from your curriculum, in minutes",
    subtitle: "Upload the textbook, pick chapters and pages, and let AI draft questions in the Iraqi exam style with model answers and mark allocation — then review and edit before printing.",
    cta: "Get started",
    secondary: "Browse supported curricula",
    note: "Fully paid platform — accounts are activated after the admin confirms the subscription.",
  },
  paper: {
    sample: "Illustrative design sample",
    republic: "Republic of Iraq",
    ministry: "Ministry of Education",
    directorate: "General Directorate of Education",
    subject: "Subject: Mathematics",
    grade: "Grade: Third Intermediate",
    time: "Time: 2 hours",
    model: "Model A",
    q1: "Q1: Answer five only of the following:",
    q1a: ["a) Expand", "(2x − 3)(x + 4)"],
    q1b: ["b) Solve", "x² − 5x + 6 = 0"],
    q2: "Q2: Choose the correct answer:",
    marks: "10 marks",
  },
  curricula: {
    title: "Every Iraqi curriculum in one place",
    subtitle: "General curriculum, Distinguished (gifted) schools and International curricula — with stages, grades and branches exactly as in the Iraqi system.",
    tryTitle: "Try picking a grade",
    stage: "Stage",
    grade: "Grade",
    track: "Curriculum",
    branch: "Branch",
    choose: "Choose…",
    none: "None",
    loading: "Loading…",
    error: "Could not load data. Please try again.",
    gradesCount: (n: number) => `${n} grades`,
  },
  how: {
    title: "How it works",
    steps: [
      ["Configure the exam", "Stage, grade, curriculum, subject, chapters, page range, number of questions and marks."],
      ["Upload the book", "A PDF of the textbook — the system extracts text and analyses topics and concepts."],
      ["AI generation", "Original curriculum-based questions in the Iraqi exam style, with answers and marks."],
      ["Review & export", "Edit in the editor, choose a template and header, export PDF or Word in models A/B/C/D."],
    ],
  },
  features: {
    title: "Built for what teachers actually need",
    items: [
      ["Iraqi exam style", "Justify, define, compare, parse, prove, balance the equation — phrasing adapts to subject and grade."],
      ["Equivalent models A/B/C/D", "Same difficulty, distribution and topics — not just shuffled numbers."],
      ["Full question editor", "Edit, sub-questions, reorder, lock, rephrase or regenerate, with complete revision history."],
      ["Templates & headers", "Classic, school, academic, minimal — with school logo and toggleable header fields."],
      ["Print-ready export", "PDF and editable Word, questions-only and answer-key versions, ZIP of all models."],
      ["Security & privacy", "Email and phone verification, server-side permissions, and no card data stored."],
    ],
  },
  pricing: {
    title: "Subscription",
    subtitle: "There is no free tier. Pay by Mastercard or cash; subscriptions are activated after admin confirmation.",
    perDays: (d: number) => `for ${d} days`,
    iqd: "IQD",
    empty: "Subscription plans will be announced soon.",
  },
  footer: { rights: "All rights reserved.", disclaimer: "Sual AI is an independent platform, not affiliated with the Ministry of Education." },
  soon: { title: "Coming soon", body: "This page opens in the next release phase of the platform.", back: "Back to home" },
  langSwitch: "العربية",
};

export const dictionaries: Record<Locale, Dictionary> = { ar, en };

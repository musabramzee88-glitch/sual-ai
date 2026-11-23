import type { Locale } from "./dictionaries";

/** نصوص ورقة الامتحان والقوالب (قيم نصية فقط) */
const ar = {
  sheet: {
    title: "ورقة الامتحان", back: "العودة للتحرير", questions: "الأسئلة", answers: "الأسئلة مع الإجابات", key: "الإجابات النموذجية", answerSheet: "ورقة الإجابة", fitOk: "ورقة الأسئلة: {p} صفحة (الحد الأقصى {m}).", fitAdjusted: "ضُبط حجم الورقة تلقائياً لتتسع في {m} صفحة فقط (للطباعة وجهاً وقفا).", fitOver: "لا تتسع الورقة في {m} صفحة حتى بأصغر تنسيق مقروء (تحتاج {p}). قلّل عدد الأسئلة أو زِد الحد الأقصى للصفحات من القالب.", models: "النموذج", noModel: "بلا", modelsHint: "النماذج تخلط ترتيب الأسئلة والخيارات، ولكل نموذج إجاباته النموذجية.",
    print: "طباعة", pdf: "تحميل PDF", pdfBusy: "جارٍ إنشاء PDF…", word: "تحميل Word", zip: "حزمة ZIP", zipTitle: "تنزيل حزمة ملفات", zipHint: "ملف لكل نموذج ونسخة داخل ملف ZIP واحد. إنشاء PDF لعدة ملفات قد يستغرق نصف دقيقة.", format: "الصيغة", zipNoModel: "اترك النماذج فارغة للنموذج الأصلي بلا حرف.", zipVariants: "النسخ", pdfName: "اسم الملف", pdfNameHint: "يُحفظ بصيغة PDF. اكتب الاسم الذي تريده.", download: "تنزيل", dlCancel: "إلغاء", template: "القالب", manage: "إدارة القوالب",
    header: "بيانات الترويسة لهذا الامتحان", headerHint: "ما تكتبه هنا يخص هذا الامتحان ويتقدّم على قيم القالب. اتركه فارغاً لاستعمال قيمة القالب أو فراغ للكتابة اليدوية.",
    save: "حفظ وتحديث المعاينة", saved: "تم الحفظ", preview: "معاينة مطابقة للطباعة وPDF",
  },
  tpl: {
    title: "قوالب الورقة", intro: "القالب يحدد شكل الترويسة والخط والهوامش، ويحفظ بيانات ثابتة (المدرسة، المديرية، اسمك، الشعار) فلا تكتبها في كل امتحان.",
    presets: "قوالب جاهزة", mine: "قوالبي", none: "لا قوالب بعد — ابدأ من قالب جاهز.", useAsBase: "إنشاء قالب منه", edit: "تعديل", del: "حذف", confirmDel: "حذف القالب؟",
    newTpl: "قالب جديد", name: "اسم القالب", layout: "شكل الترويسة", layouts: { CLASSIC: "كلاسيكي (ثلاثة أعمدة)", SCHOOL: "باسم المدرسة في الأعلى", ACADEMIC: "رسمي بجدول بيانات", MINIMAL: "مختصر" } as Record<string, string>,
    page: "الورقة", pageSize: "الحجم", orientation: "الاتجاه", portrait: "عمودي", landscape: "أفقي",
    font: "الخط", fontSize: "حجم الخط (نقطة)", lineSpacing: "تباعد الأسطر", margins: "الهوامش (ملم)", top: "أعلى", right: "يمين", bottom: "أسفل", left: "يسار",
    pageNumbers: "ترقيم الصفحات في PDF", answerLines: "أسطر الإجابة تحت كل فرع (0 = بلا)", footer: "عبارة الختام", signLine: "سطر «معلم/ة المادة» أسفل الورقة", accent: "لون الإطار والعناوين", maxPages: "أقصى عدد صفحات لورقة الأسئلة", maxPagesHint: "تُصغَّر الورقة تلقائياً (الخط والمسافات) لتتسع في هذا العدد، والافتراضي صفحتان للطباعة وجهاً وقفا. اكتب 0 لإلغاء الحد.", accentBlack: "أسود (الافتراضي)", accentHint: "الأسود الأنسب للطباعة بالأبيض والأسود؛ الألوان تظهر رمادية إن طبعت هكذا.", isDefault: "القالب الافتراضي لامتحاناتي",
    fields: "حقول الترويسة", fieldsHint: "أظهر أو أخفِ كل حقل، واكتب القيم الثابتة. حقول مثل المادة والصف والدرجة تُملأ من الامتحان تلقائياً.",
    show: "إظهار", value: "القيمة الثابتة", auto: "من الامتحان",
    logo: "الشعار", noLogo: "بلا شعار", upload: "رفع شعار (PNG/JPEG حتى 1MB)", save: "حفظ القالب", cancel: "إلغاء", saved: "تم الحفظ",
    preset: "جاهز", default: "افتراضي", note: "لا يُذكر أن الورقة معتمدة من الوزارة؛ «جمهورية العراق/وزارة التربية» ترويسة تقليدية يمكنك إخفاؤها.",
  },
  errors: {
    PDF_UNAVAILABLE: "تعذّر تشغيل متصفح لإنشاء PDF على الخادم. ثبّت Edge أو Chrome أو ضع CHROMIUM_PATH في ‎.env‎.",
    PDF_FAILED: "تعذّر إنشاء PDF. حاول مرة أخرى.", RATE_LIMITED: "طلبات كثيرة متتالية. انتظر دقيقة.",
    TEMPLATE_NOT_FOUND: "القالب غير موجود.", LOGO_NOT_FOUND: "الشعار غير موجود.", TOO_MANY_TEMPLATES: "وصلت للحد الأقصى (30 قالباً).",
    TOO_MANY_LOGOS: "وصلت للحد الأقصى من الشعارات (20).", FILE_TOO_LARGE: "الملف أكبر من 1MB.", UNSUPPORTED_FILE: "الشعار يجب أن يكون PNG أو JPEG.",
    VALIDATION_ERROR: "قيم غير صالحة.", GENERIC: "حدث خطأ. حاول مرة أخرى.",
  } as Record<string, string>,
};

type TemplatesDict = typeof ar;

const en: TemplatesDict = {
  sheet: {
    title: "Exam sheet", back: "Back to editing", questions: "Questions", answers: "Questions with answers", key: "Answer key", answerSheet: "Answer sheet", fitOk: "Question paper: {p} page(s) (max {m}).", fitAdjusted: "The sheet was resized automatically to fit {m} page(s) (for double-sided printing).", fitOver: "The paper does not fit {m} page(s) even at the smallest readable layout (needs {p}). Reduce the number of questions or raise the page limit in the template.", models: "Model", noModel: "None", modelsHint: "Models shuffle the order of questions and choices; each has its own answer key.",
    print: "Print", pdf: "Download PDF", pdfBusy: "Creating PDF…", word: "Download Word", zip: "ZIP bundle", zipTitle: "Download a bundle", zipHint: "One file per model and copy in a single ZIP. Making many PDFs can take half a minute.", format: "Format", zipNoModel: "Leave models empty for the original, without a letter.", zipVariants: "Copies", pdfName: "File name", pdfNameHint: "Saved as a PDF. Type the name you want.", download: "Download", dlCancel: "Cancel", template: "Template", manage: "Manage templates",
    header: "Header details for this exam", headerHint: "Values here apply to this exam only and override the template. Leave empty to use the template value or a blank to fill by hand.",
    save: "Save and refresh preview", saved: "Saved", preview: "Preview identical to print and PDF",
  },
  tpl: {
    title: "Sheet templates", intro: "A template sets the header layout, font and margins, and stores fixed details (school, directorate, your name, logo) so you don't retype them.",
    presets: "Ready-made", mine: "My templates", none: "No templates yet — start from a ready-made one.", useAsBase: "Create from this", edit: "Edit", del: "Delete", confirmDel: "Delete this template?",
    newTpl: "New template", name: "Template name", layout: "Header layout", layouts: { CLASSIC: "Classic (three columns)", SCHOOL: "School name on top", ACADEMIC: "Formal with info table", MINIMAL: "Minimal" },
    page: "Page", pageSize: "Size", orientation: "Orientation", portrait: "Portrait", landscape: "Landscape",
    font: "Font", fontSize: "Font size (pt)", lineSpacing: "Line spacing", margins: "Margins (mm)", top: "Top", right: "Right", bottom: "Bottom", left: "Left",
    pageNumbers: "Page numbers in PDF", answerLines: "Answer lines under each item (0 = none)", footer: "Closing line", signLine: "“Subject teacher” line at the bottom", accent: "Frame and heading colour", maxPages: "Max pages for the question paper", maxPagesHint: "The sheet is resized automatically (font and spacing) to fit; default is 2 pages for double-sided printing. Enter 0 for no limit.", accentBlack: "Black (default)", accentHint: "Black suits black-and-white printing; colours print as grey that way.", isDefault: "Default template for my exams",
    fields: "Header fields", fieldsHint: "Show or hide each field and write fixed values. Subject, grade and marks are filled from the exam.",
    show: "Show", value: "Fixed value", auto: "From the exam",
    logo: "Logo", noLogo: "No logo", upload: "Upload logo (PNG/JPEG up to 1MB)", save: "Save template", cancel: "Cancel", saved: "Saved",
    preset: "Ready-made", default: "Default", note: "The sheet never claims ministry approval; the traditional “Republic of Iraq / Ministry of Education” lines can be hidden.",
  },
  errors: {
    PDF_UNAVAILABLE: "No browser available on the server to create the PDF. Install Edge or Chrome or set CHROMIUM_PATH in .env.",
    PDF_FAILED: "Could not create the PDF. Try again.", RATE_LIMITED: "Too many requests. Wait a minute.",
    TEMPLATE_NOT_FOUND: "Template not found.", LOGO_NOT_FOUND: "Logo not found.", TOO_MANY_TEMPLATES: "Limit reached (30 templates).",
    TOO_MANY_LOGOS: "Logo limit reached (20).", FILE_TOO_LARGE: "File larger than 1MB.", UNSUPPORTED_FILE: "Logo must be PNG or JPEG.",
    VALIDATION_ERROR: "Invalid values.", GENERIC: "Something went wrong. Try again.",
  },
};

export const templateDicts: Record<Locale, TemplatesDict> = { ar, en };
export type { TemplatesDict };

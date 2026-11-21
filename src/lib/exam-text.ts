/**
 * تهذيب نص الأسئلة العربية (دوال نقية): الصيغ الكاملة للصلاة والترضّي بدل الاختصارات، تُربط كلماتها بمسافة غير
 * قابلة للكسر فتبقى «كأنها كلمة واحدة» في السطر؛ وحذف فعل التعليمة المكرر من بداية الفرع (التعليمة تُطبع مرة فوق القسم).
 */
import type { QType } from "./question-types";

const NB = " ";
const join = (s: string) => s.replace(/ /g, NB);

export const HONOR = {
  prophet: join("(صلى الله عليه وآله وسلم)"),
  peace: join("(عليه السلام)"),
  peaceF: join("(عليها السلام)"),
  peaceP: join("(عليهم السلام)"),
  sahabi: join("(رضي الله عنه)"),
  sahabiya: join("(رضي الله عنها)"),
  sahabaP: join("(رضي الله عنهم)"),
  sahabaD: join("(رضي الله عنهما)"),
  mercy: join("(رحمه الله)"),
};

const TASH = "[\\u064B-\\u0652\\u0670]*";
// كلمة عربية بتشكيل اختياري بين حروفها: «صلّى» = ص ل ّ ى
const w = (word: string) => [...word].map((c) => c + TASH).join("");
const sp = "[\\s\\u00A0]*";
const SALAWAT = `${w("صلى")}${sp}${w("الله")}${sp}${w("عليه")}${sp}(?:${w("وآله")}|${w("واله")}|${w("وعلى")}${sp}${w("آله")})?${sp}${w("وسلم")}`;

// كل الصيغ في تعبير واحد يُطبَّق مرة واحدة (لا يُعاد مطابقة ما استُبدل): الأطول أولاً
const open = `[(（]?${sp}`, close = `${sp}[)）]?`;
const ALTS: [string, string][] = [
  [`${open}${SALAWAT}${close}`, HONOR.prophet],
  [`[(（]\\s*ﷺ\\s*[)）]|ﷺ`, HONOR.prophet],
  [`[(（]\\s*(?:ص|صلعم)\\s*[)）]`, HONOR.prophet],
  [`${open}${w("عليهم")}${sp}${w("السلام")}${close}`, HONOR.peaceP],
  [`${open}${w("عليها")}${sp}${w("السلام")}${close}`, HONOR.peaceF],
  [`${open}${w("عليه")}${sp}${w("السلام")}${close}`, HONOR.peace],
  [`[(（]\\s*ع\\s*[)）]`, HONOR.peace],
  [`${open}${w("رضي")}${sp}${w("الله")}${sp}${w("عنهما")}${close}`, HONOR.sahabaD],
  [`${open}${w("رضي")}${sp}${w("الله")}${sp}${w("عنهم")}${close}`, HONOR.sahabaP],
  [`${open}${w("رضي")}${sp}${w("الله")}${sp}${w("عنها")}${close}`, HONOR.sahabiya],
  [`${open}${w("رضي")}${sp}${w("الله")}${sp}${w("عنه")}${close}`, HONOR.sahabi],
  [`[(（]\\s*رض\\s*[)）]`, HONOR.sahabi],
  [`[(（]\\s*رح\\s*[)）]`, HONOR.mercy],
];
const HONOR_RE = new RegExp(ALTS.map(([re]) => `(${re})`).join("|"), "g");

/** الصيغ الكاملة للصلاة على النبي والتسليم على الأنبياء والترضّي، مربوطة لا تنكسر */
export function normalizeHonorifics(text: string): string {
  if (!/[\u0600-\u06FF]/.test(text)) return text;
  const out = text.replace(HONOR_RE, (...m: unknown[]) => {
    const i = (m.slice(1, ALTS.length + 1) as (string | undefined)[]).findIndex((g) => g !== undefined);
    return i >= 0 ? ALTS[i][1] : String(m[0]);
  });
  // مسافة قبل الصيغة إن التصقت بالكلمة السابقة
  return out.replace(/([^\s\u00A0(])(\((?:صلى|عليه|عليها|عليهم|رضي|رحمه)\u00A0)/g, "$1 $2");
}

/** يبني تعبيراً يتسامح مع التشكيل بعد كل حرف عربي (لا تُستعمل حروف عربية داخل [ ] هنا) */
const T = (src: string, flags = "") => new RegExp(src.replace(/([\u0621-\u064A])/g, "$1[\\u064B-\\u0652\\u0670]*"), flags);

/** أفعال التعليمة التي لا تتكرر في بداية كل فرع (العربية والإنكليزية) */
const LEADS: Partial<Record<QType, RegExp>> = {
  DEFINE: T(String.raw`^(?:عرف|عرف|ما\s+المقصود\s+ب(?:ـ)?|ما\s+المقصود|define|what\s+is\s+meant\s+by)\s*[:：\-–]?\s*`, "i"),
  JUSTIFY: T(String.raw`^(?:علل|علل|give\s+(?:a\s+)?reasons?(?:\s+for)?)\s*[:：\-–]?\s*`, "i"),
  COMPARE: T(String.raw`^(?:قارن\s+بين|قارن|compare(?:\s+between)?)\s*[:：\-–]?\s*`, "i"),
  LIST: T(String.raw`^(?:عدد|عدد|list)\s*[:：\-–]?\s*`, "i"),
  WHAT_IF: T(String.raw`^(?:ماذا\s+يحدث|what\s+happens)\s+(?=لو|عند|عندما|إذا|اذا|if|when)`, "i"),
  COMPLETE_VERSE: T(String.raw`^(?:أكمل|اكمل)(?:\s+(?:الآية|الآيات|الاية|الايات))?(?:\s+الكريمة)?(?:\s+الآتية|\s+الاتية)?\s*[:：\-–]?\s*`, ""),
  COMPLETE_POEM: T(String.raw`^(?:أكمل|اكمل)(?:\s+(?:البيت|الأبيات|الابيات|الأبيات\s+الشعرية))?(?:\s+الآتية|\s+الاتية)?\s*[:：\-–]?\s*`, ""),
  WRITE_VERSE: T(String.raw`^(?:اكتب|أكتب|اذكر)\s+(?:الآية|الآيات|الاية|الايات)(?:\s+الكريمة)?\s*(?:[:：\-–]\s*)?`, ""),
  WRITE_HADITH: T(String.raw`^(?:اكتب|أكتب|اذكر|أذكر)\s+(?:نص\s+)?الحديث(?:\s+النبوي)?(?:\s+الشريف)?\s+(?:الذي\s+يدل\s+على|الدال\s+على|الخاص\s+ب(?:ـ)?|عن|في)\s*[:：\-–]?\s*`, ""),
  WORD_MEANINGS: T(String.raw`^(?:ما\s+معنى|هات\s+معنى|بين\s+معنى)(?:\s+كلمة)?\s*[:：\-–]?\s*`, ""),
  EXPLAIN_VERSE: T(String.raw`^(?:وضح|وضح|فسر|فسر)\s*(?:معنى)?\s*[:：\-–]?\s*`, ""),
  LESSONS: T(String.raw`^(?:ما\s+الذي\s+تستفيده\s+من|ماذا\s+تستفيد\s+من|ما\s+يستفاد\s+من)\s*`, ""),
  TAJWEED: T(String.raw`^(?:بين|بين|ما)\s+حكم\s+(?:التلاوة|التجويد)?\s*(?:في)?\s*[:：\-–]?\s*`, ""),
  SITUATION: T(String.raw`^ماذا\s+تفعل\s+(?=لو|إذا|اذا|عندما|حين)`, ""),
  GRAMMAR_PARSING: T(String.raw`^(?:أعرب|اعرب)(?:\s+(?:ما\s+تحته\s+خط|ما\s+بين\s+القوسين|الكلمة|الكلمات))?\s*[:：\-–]?\s*`, ""),
  EXTRACT: T(String.raw`^استخرج\s+`, ""),
  CONVERT: T(String.raw`^(?:حول|حول)\s+`, ""),
  CORRECT_ERROR: T(String.raw`^(?:صحح|صحح)\s+(?:الخطأ|الخطا)(?:\s+في)?(?:\s+الجملة(?:\s+الآتية)?)?\s*[:：\-–]?\s*`, ""),
  WORD_FORMS: T(String.raw`^هات\s+`, ""),
  COMPUTE: T(String.raw`^(?:جد|أوجد|اوجد)\s+ناتج\s*[:：\-–]?\s*`, ""),
  WHO_SAID: T(String.raw`^(?:من\s+القائل|من\s+قال)\s*[؟?]?\s*(?:ولمن(?:\s+قال)?\s*[؟?]?)?\s*[:：\-–]?\s*`, ""),
  REORDER: T(String.raw`^(?:rearrange|put)[^:]*:\s*`, "i"),
  VERB_FORMS: T(String.raw`^correct\s+the\s+verbs?[^:]*:\s*`, "i"),
};

/** يحذف فعل التعليمة من بداية الفرع إن كرره (يبقى النص كما هو إن لم يبقَ بعده شيء ذو معنى) */
export function stripLead(type: QType, prompt: string): string {
  const re = LEADS[type];
  if (!re) return prompt;
  const out = prompt.replace(re, "").trim();
  return out.length >= 2 ? out : prompt;
}

/** التهذيب الكامل لفرع سؤال قبل حفظه */
export function polishQuestion(type: QType, lang: "AR" | "EN", q: { prompt: string; answer: string; options: string[] | null }) {
  const h = lang === "AR" ? normalizeHonorifics : (s: string) => s;
  return { prompt: h(stripLead(type, q.prompt)), answer: h(q.answer), options: q.options ? q.options.map(h) : null };
}

/**
 * تخمين الصف والمادة ونوع الكتاب من اسم ملف PDF (دوال نقية). التخمين اقتراح فقط:
 * الواجهة تعرضه للمراجعة والتعديل قبل أي إنشاء أو ربط، ولا يُطبَّق آلياً.
 */
export type BookGuess = { gradeCode: string | null; subjectCode: string | null; kind: "TEXTBOOK" | "EXERCISES" | "ACTIVITY" };

/** تطبيع عربي للمطابقة: همزات الألف، ى→ي، ة→ه، حذف التشكيل، والفواصل → مسافات */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\.pdf$/i, "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[-_.()\s]+/g, " ")
    .trim();
}

const ORD: [RegExp, number][] = [
  [/(^| )(ال)?اول( |$)/, 1], [/(^| )(ال)?ثاني( |$)/, 2], [/(^| )(ال)?ثالث( |$)/, 3],
  [/(^| )(ال)?رابع( |$)/, 4], [/(^| )(ال)?خامس( |$)/, 5], [/(^| )(ال)?سادس( |$)/, 6],
];

export function guessGrade(n: string): string | null {
  const ord = ORD.find(([rx]) => rx.test(n))?.[1];
  if (!ord) return null;
  if (n.includes("ابتدا")) return `PRI_${ord}`;
  if (n.includes("متوسط")) return ord <= 3 ? `INT_${ord}` : null;
  if (n.includes("اعداد")) return ord >= 4 ? `PREP_${ord}` : null;
  return null;
}

/** الترتيب مهم: الأخص قبل الأعم (القواعد/القراءة قبل «عربي»، والتربية الأخلاقية قبل غيرها) */
const SUBJECTS: [RegExp, string][] = [
  [/اخلاق/, "ETHICS"], [/قواعد/, "GRAMMAR"], [/قراء/, "READING"], [/رياضيات/, "MATH"],
  [/علوم/, "SCIENCE"], [/فيزياء/, "PHYSICS"], [/كيمياء/, "CHEMISTRY"], [/احياء/, "BIOLOGY"],
  [/اسلام/, "ISLAMIC"], [/اجتماعيات/, "SOCIAL"], [/تاريخ/, "HISTORY"], [/جغراف/, "GEOGRAPHY"], [/اقتصاد/, "ECONOMICS"],
  [/انكليز|انجليز|english/, "ENGLISH"], [/فرنس/, "FRENCH"], [/كرد/, "KURDISH"], [/حاسوب|حاسب/, "COMPUTER"],
  [/تربيه فني|^فني| فني/, "ART"], [/تربيه رياضيه|بدني/, "PE"], [/موسيق/, "MUSIC"], [/عربي/, "ARABIC"],
];

export function guessSubject(n: string): string | null {
  return SUBJECTS.find(([rx]) => rx.test(n))?.[1] ?? null;
}

export function guessKind(n: string): BookGuess["kind"] {
  if (/تمرين|تمارين/.test(n)) return "EXERCISES";
  if (/نشاط/.test(n)) return "ACTIVITY";
  return "TEXTBOOK";
}

export function guessFromName(fileName: string): BookGuess {
  const n = normalizeName(fileName);
  return { gradeCode: guessGrade(n), subjectCode: guessSubject(n), kind: guessKind(n) };
}

/** لغة الكتاب الافتراضية: كتب اللغة الإنكليزية بالإنكليزية، وغيرها بالعربية */
export const languageOf = (subjectCode: string): "AR" | "EN" => (subjectCode === "ENGLISH" ? "EN" : "AR");

/**
 * بيانات مرجعية حقيقية للنظام التعليمي العراقي.
 * كلها قابلة للتعديل من لوحة الإدارة بعد الزرع — هذا الملف نقطة البداية فقط.
 * لا يحتوي على أسعار اشتراكات أو مناهج/كتب وهمية: تلك يضيفها صاحب المنصة.
 */
import type { Locale, QuestionType, SubjectFamily } from "@prisma/client";

export const STAGES = [
  {
    code: "PRIMARY",
    nameAr: "المرحلة الابتدائية",
    nameEn: "Primary",
    grades: [
      ["PRI_1", "الأول الابتدائي", "First Primary"],
      ["PRI_2", "الثاني الابتدائي", "Second Primary"],
      ["PRI_3", "الثالث الابتدائي", "Third Primary"],
      ["PRI_4", "الرابع الابتدائي", "Fourth Primary"],
      ["PRI_5", "الخامس الابتدائي", "Fifth Primary"],
      ["PRI_6", "السادس الابتدائي", "Sixth Primary"],
    ],
  },
  {
    code: "INTERMEDIATE",
    nameAr: "المرحلة المتوسطة",
    nameEn: "Intermediate",
    grades: [
      ["INT_1", "الأول المتوسط", "First Intermediate"],
      ["INT_2", "الثاني المتوسط", "Second Intermediate"],
      ["INT_3", "الثالث المتوسط", "Third Intermediate"],
    ],
  },
  {
    code: "PREPARATORY",
    nameAr: "المرحلة الإعدادية",
    nameEn: "Preparatory",
    grades: [
      ["PREP_4", "الرابع الإعدادي", "Fourth Preparatory"],
      ["PREP_5", "الخامس الإعدادي", "Fifth Preparatory"],
      ["PREP_6", "السادس الإعدادي", "Sixth Preparatory"],
    ],
  },
] as const;

const ALL_GRADES = STAGES.flatMap((s) => s.grades.map((g) => g[0]));
const SECONDARY_GRADES = ALL_GRADES.filter((g) => !g.startsWith("PRI_"));

export const TRACKS: {
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  defaultLanguage: Locale;
  grades: readonly string[];
}[] = [
  {
    code: "GENERAL",
    nameAr: "المنهج العام",
    nameEn: "General Curriculum",
    descriptionAr: "منهج وزارة التربية المعتمد في المدارس الحكومية والأهلية.",
    descriptionEn: "The Ministry of Education curriculum used in public and private schools.",
    defaultLanguage: "AR",
    grades: ALL_GRADES,
  },
  {
    code: "GIFTED",
    nameAr: "مدارس المتميزين",
    nameEn: "Distinguished (Gifted) Schools",
    descriptionAr: "منهج مدارس المتميزين للمرحلتين المتوسطة والإعدادية.",
    descriptionEn: "Curriculum of distinguished schools for intermediate and preparatory stages.",
    defaultLanguage: "AR",
    grades: SECONDARY_GRADES,
  },
  {
    code: "INTERNATIONAL",
    nameAr: "المنهج الدولي",
    nameEn: "International Curriculum",
    descriptionAr: "مناهج المدارس الدولية (غالباً باللغة الإنكليزية للمواد العلمية).",
    descriptionEn: "International school curricula (typically English-medium for sciences).",
    defaultLanguage: "EN",
    grades: ALL_GRADES,
  },
];

export const BRANCHES = [
  { code: "SCIENTIFIC", nameAr: "العلمي", nameEn: "Scientific", grades: ["PREP_4"] },
  { code: "APPLIED", nameAr: "العلمي التطبيقي", nameEn: "Scientific – Applied", grades: ["PREP_5", "PREP_6"] },
  { code: "BIOLOGICAL", nameAr: "العلمي الأحيائي", nameEn: "Scientific – Biological", grades: ["PREP_5", "PREP_6"] },
  { code: "LITERARY", nameAr: "الأدبي", nameEn: "Literary", grades: ["PREP_4", "PREP_5", "PREP_6"] },
] as const;

const Q = {
  core: ["MCQ", "TRUE_FALSE", "FILL_BLANK"] as QuestionType[],
};

export const SUBJECTS: {
  code: string;
  nameAr: string;
  nameEn: string;
  family: SubjectFamily;
  useLatinSymbols: boolean;
  questionTypes: QuestionType[];
}[] = [
  { code: "MATH", nameAr: "الرياضيات", nameEn: "Mathematics", family: "MATHEMATICS", useLatinSymbols: true,
    questionTypes: [...Q.core, "DEFINE", "PROBLEM", "PROOF", "APPLIED", "DIAGRAM"] },
  { code: "PHYSICS", nameAr: "الفيزياء", nameEn: "Physics", family: "PHYSICS", useLatinSymbols: true,
    questionTypes: [...Q.core, "JUSTIFY", "DEFINE", "COMPARE", "PROBLEM", "APPLIED", "DIAGRAM", "ESSAY"] },
  { code: "CHEMISTRY", nameAr: "الكيمياء", nameEn: "Chemistry", family: "CHEMISTRY", useLatinSymbols: true,
    questionTypes: [...Q.core, "JUSTIFY", "DEFINE", "COMPARE", "PROBLEM", "EQUATION_BALANCING", "APPLIED", "DIAGRAM"] },
  { code: "BIOLOGY", nameAr: "الأحياء", nameEn: "Biology", family: "BIOLOGY", useLatinSymbols: false,
    questionTypes: [...Q.core, "JUSTIFY", "DEFINE", "COMPARE", "DIAGRAM", "ESSAY", "COMPREHENSION"] },
  { code: "SCIENCE", nameAr: "العلوم", nameEn: "Science", family: "GENERAL_SCIENCE", useLatinSymbols: true,
    questionTypes: [...Q.core, "JUSTIFY", "DEFINE", "COMPARE", "PROBLEM", "DIAGRAM", "APPLIED"] },
  { code: "ARABIC", nameAr: "اللغة العربية", nameEn: "Arabic Language", family: "ARABIC", useLatinSymbols: false,
    questionTypes: [...Q.core, "GRAMMAR_PARSING", "JUSTIFY", "DEFINE", "COMPREHENSION", "ESSAY"] },
  { code: "ENGLISH", nameAr: "اللغة الإنكليزية", nameEn: "English Language", family: "ENGLISH", useLatinSymbols: false,
    questionTypes: [...Q.core, "COMPREHENSION", "ESSAY", "DEFINE"] },
  { code: "ISLAMIC", nameAr: "التربية الإسلامية", nameEn: "Islamic Education", family: "ISLAMIC", useLatinSymbols: false,
    questionTypes: [...Q.core, "DEFINE", "JUSTIFY", "COMPARE", "ESSAY"] },
  { code: "SOCIAL", nameAr: "الاجتماعيات", nameEn: "Social Studies", family: "SOCIAL_STUDIES", useLatinSymbols: false,
    questionTypes: [...Q.core, "DEFINE", "JUSTIFY", "COMPARE", "ESSAY", "DIAGRAM"] },
  { code: "HISTORY", nameAr: "التاريخ", nameEn: "History", family: "SOCIAL_STUDIES", useLatinSymbols: false,
    questionTypes: [...Q.core, "DEFINE", "JUSTIFY", "COMPARE", "ESSAY"] },
  { code: "GEOGRAPHY", nameAr: "الجغرافية", nameEn: "Geography", family: "SOCIAL_STUDIES", useLatinSymbols: false,
    questionTypes: [...Q.core, "DEFINE", "JUSTIFY", "COMPARE", "ESSAY", "DIAGRAM"] },
  { code: "ECONOMICS", nameAr: "الاقتصاد", nameEn: "Economics", family: "SOCIAL_STUDIES", useLatinSymbols: false,
    questionTypes: [...Q.core, "DEFINE", "JUSTIFY", "COMPARE", "ESSAY", "PROBLEM"] },
  { code: "COMPUTER", nameAr: "الحاسوب", nameEn: "Computer Science", family: "COMPUTER", useLatinSymbols: true,
    questionTypes: [...Q.core, "DEFINE", "COMPARE", "APPLIED", "PROBLEM"] },
  { code: "FRENCH", nameAr: "اللغة الفرنسية", nameEn: "French Language", family: "OTHER_LANGUAGE", useLatinSymbols: false,
    questionTypes: [...Q.core, "COMPREHENSION", "ESSAY"] },
  { code: "KURDISH", nameAr: "اللغة الكردية", nameEn: "Kurdish Language", family: "OTHER_LANGUAGE", useLatinSymbols: false,
    questionTypes: [...Q.core, "COMPREHENSION", "ESSAY"] },
];

/** المحافظات العراقية والمديريات العامة للتربية فيها. */
export const GOVERNORATES: { code: string; nameAr: string; nameEn: string; directorates?: [string, string, string][] }[] = [
  { code: "BGD", nameAr: "بغداد", nameEn: "Baghdad", directorates: [
    ["BGD_KARKH_1", "المديرية العامة لتربية بغداد الكرخ الأولى", "Baghdad Al-Karkh 1st Directorate of Education"],
    ["BGD_KARKH_2", "المديرية العامة لتربية بغداد الكرخ الثانية", "Baghdad Al-Karkh 2nd Directorate of Education"],
    ["BGD_KARKH_3", "المديرية العامة لتربية بغداد الكرخ الثالثة", "Baghdad Al-Karkh 3rd Directorate of Education"],
    ["BGD_RUSAFA_1", "المديرية العامة لتربية بغداد الرصافة الأولى", "Baghdad Al-Rusafa 1st Directorate of Education"],
    ["BGD_RUSAFA_2", "المديرية العامة لتربية بغداد الرصافة الثانية", "Baghdad Al-Rusafa 2nd Directorate of Education"],
    ["BGD_RUSAFA_3", "المديرية العامة لتربية بغداد الرصافة الثالثة", "Baghdad Al-Rusafa 3rd Directorate of Education"],
  ] },
  { code: "BSR", nameAr: "البصرة", nameEn: "Basra" },
  { code: "NIN", nameAr: "نينوى", nameEn: "Nineveh" },
  { code: "ERB", nameAr: "أربيل", nameEn: "Erbil" },
  { code: "SUL", nameAr: "السليمانية", nameEn: "Sulaymaniyah" },
  { code: "DHK", nameAr: "دهوك", nameEn: "Duhok" },
  { code: "HLB", nameAr: "حلبجة", nameEn: "Halabja" },
  { code: "KRK", nameAr: "كركوك", nameEn: "Kirkuk" },
  { code: "DIY", nameAr: "ديالى", nameEn: "Diyala" },
  { code: "ANB", nameAr: "الأنبار", nameEn: "Anbar" },
  { code: "SAH", nameAr: "صلاح الدين", nameEn: "Salah al-Din" },
  { code: "BBL", nameAr: "بابل", nameEn: "Babylon" },
  { code: "KRB", nameAr: "كربلاء", nameEn: "Karbala" },
  { code: "NJF", nameAr: "النجف", nameEn: "Najaf" },
  { code: "QAD", nameAr: "الديوانية", nameEn: "Al-Qadisiyah" },
  { code: "WAS", nameAr: "واسط", nameEn: "Wasit" },
  { code: "MUT", nameAr: "المثنى", nameEn: "Muthanna" },
  { code: "DHQ", nameAr: "ذي قار", nameEn: "Dhi Qar" },
  { code: "MYS", nameAr: "ميسان", nameEn: "Maysan" },
];

/** إن لم تُحدَّد مديريات للمحافظة تُنشأ مديرية عامة واحدة باسمها. */
export function directoratesFor(g: (typeof GOVERNORATES)[number]): [string, string, string][] {
  return g.directorates ?? [[`${g.code}_MAIN`, `المديرية العامة لتربية ${g.nameAr}`, `${g.nameEn} Directorate of Education`]];
}

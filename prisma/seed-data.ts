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

import { SUBJECT_TYPES } from "../src/lib/question-types";

// أنواع الأسئلة لكل مادة: src/lib/question-types.ts (SUBJECT_TYPES)
export const SUBJECTS: {
  code: string;
  nameAr: string;
  nameEn: string;
  family: SubjectFamily;
  useLatinSymbols: boolean;
  questionTypes: QuestionType[];
}[] = [
  { code: "MATH", nameAr: "الرياضيات", nameEn: "Mathematics", family: "MATHEMATICS", useLatinSymbols: true,
    questionTypes: SUBJECT_TYPES.MATH as QuestionType[] },
  { code: "PHYSICS", nameAr: "الفيزياء", nameEn: "Physics", family: "PHYSICS", useLatinSymbols: true,
    questionTypes: SUBJECT_TYPES.PHYSICS as QuestionType[] },
  { code: "CHEMISTRY", nameAr: "الكيمياء", nameEn: "Chemistry", family: "CHEMISTRY", useLatinSymbols: true,
    questionTypes: SUBJECT_TYPES.CHEMISTRY as QuestionType[] },
  { code: "BIOLOGY", nameAr: "الأحياء", nameEn: "Biology", family: "BIOLOGY", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.BIOLOGY as QuestionType[] },
  { code: "SCIENCE", nameAr: "العلوم", nameEn: "Science", family: "GENERAL_SCIENCE", useLatinSymbols: true,
    questionTypes: SUBJECT_TYPES.SCIENCE as QuestionType[] },
  { code: "ARABIC", nameAr: "اللغة العربية", nameEn: "Arabic Language", family: "ARABIC", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.ARABIC as QuestionType[] },
  { code: "ENGLISH", nameAr: "اللغة الإنكليزية", nameEn: "English Language", family: "ENGLISH", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.ENGLISH as QuestionType[] },
  { code: "ISLAMIC", nameAr: "التربية الإسلامية", nameEn: "Islamic Education", family: "ISLAMIC", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.ISLAMIC as QuestionType[] },
  { code: "SOCIAL", nameAr: "الاجتماعيات", nameEn: "Social Studies", family: "SOCIAL_STUDIES", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.SOCIAL as QuestionType[] },
  { code: "HISTORY", nameAr: "التاريخ", nameEn: "History", family: "SOCIAL_STUDIES", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.HISTORY as QuestionType[] },
  { code: "GEOGRAPHY", nameAr: "الجغرافية", nameEn: "Geography", family: "SOCIAL_STUDIES", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.GEOGRAPHY as QuestionType[] },
  { code: "ECONOMICS", nameAr: "الاقتصاد", nameEn: "Economics", family: "SOCIAL_STUDIES", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.ECONOMICS as QuestionType[] },
  { code: "COMPUTER", nameAr: "الحاسوب", nameEn: "Computer Science", family: "COMPUTER", useLatinSymbols: true,
    questionTypes: SUBJECT_TYPES.COMPUTER as QuestionType[] },
  // مواد المرحلة الابتدائية التي تُدرَّس بكتب مستقلة أو لا تتبع عائلة أخرى
  { code: "READING", nameAr: "القراءة", nameEn: "Reading (Arabic)", family: "ARABIC", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.READING as QuestionType[] },
  { code: "GRAMMAR", nameAr: "القواعد", nameEn: "Grammar (Arabic)", family: "ARABIC", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.GRAMMAR as QuestionType[] },
  { code: "ETHICS", nameAr: "التربية الأخلاقية", nameEn: "Moral Education", family: "ISLAMIC", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.ETHICS as QuestionType[] },
  { code: "ART", nameAr: "التربية الفنية", nameEn: "Art Education", family: "OTHER", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.ART as QuestionType[] },
  { code: "PE", nameAr: "التربية الرياضية", nameEn: "Physical Education", family: "OTHER", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.PE as QuestionType[] },
  { code: "MUSIC", nameAr: "التربية الموسيقية", nameEn: "Music Education", family: "OTHER", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.MUSIC as QuestionType[] },
  { code: "FRENCH", nameAr: "اللغة الفرنسية", nameEn: "French Language", family: "OTHER_LANGUAGE", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.FRENCH as QuestionType[] },
  { code: "KURDISH", nameAr: "اللغة الكردية", nameEn: "Kurdish Language", family: "OTHER_LANGUAGE", useLatinSymbols: false,
    questionTypes: SUBJECT_TYPES.KURDISH as QuestionType[] },
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

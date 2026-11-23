import type { Locale } from "./dictionaries";

/** تسميات التنقل (قيم نصية فقط) */
const ar = {
  home: "الرئيسية", exams: "امتحاناتي", newExam: "امتحان جديد", newShort: "جديد", templates: "القوالب", subscribe: "الاشتراك", account: "الحساب", admin: "الإدارة",
  examQuestions: "الأسئلة والتعديل", examSheet: "الورقة والتنزيل", main: "التنقل الرئيسي", examNav: "أقسام الامتحان",
};
type NavDict = typeof ar;
const en: NavDict = {
  home: "Home", exams: "My exams", newExam: "New exam", newShort: "New", templates: "Templates", subscribe: "Subscription", account: "Account", admin: "Admin",
  examQuestions: "Questions & editing", examSheet: "Sheet & download", main: "Main navigation", examNav: "Exam sections",
};
export const navDicts: Record<Locale, NavDict> = { ar, en };
export type { NavDict };

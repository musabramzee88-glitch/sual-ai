import { describe, expect, it } from "vitest";
import { guessFromName } from "./names";

// أسماء حقيقية من ملفات المستخدم (الأول/الرابع/السادس الابتدائي)
const cases: [string, ReturnType<typeof guessFromName>][] = [
  ["كتاب-الرياضيات-الاول-الابتدائي-350lg41.pdf", { gradeCode: "PRI_1", subjectCode: "MATH", kind: "TEXTBOOK" }],
  ["كتاب-تمرينات-الرياضيات-الاول-الابتدائي-ddawymi.pdf", { gradeCode: "PRI_1", subjectCode: "MATH", kind: "EXERCISES" }],
  ["كتاب-العلوم-الاول-الابتدائي-lruqhtn.pdf", { gradeCode: "PRI_1", subjectCode: "SCIENCE", kind: "TEXTBOOK" }],
  ["كتاب-نشاط-العلوم-الاول-الابتدائي-mdnmmod.pdf", { gradeCode: "PRI_1", subjectCode: "SCIENCE", kind: "ACTIVITY" }],
  ["كتاب-القراءة-الاول-الابتدائي-2027-pg7x2mt.pdf", { gradeCode: "PRI_1", subjectCode: "READING", kind: "TEXTBOOK" }],
  ["نشاط-القراءة-الاول-الابتدائي-2026-hxk7wnj.pdf", { gradeCode: "PRI_1", subjectCode: "READING", kind: "ACTIVITY" }],
  ["كتاب-الاسلامية-الاول-الابتدائي-sozacyh.pdf", { gradeCode: "PRI_1", subjectCode: "ISLAMIC", kind: "TEXTBOOK" }],
  ["كتاب-التربية-الاخلاقية-الاول-الابتدائي-x.pdf", { gradeCode: "PRI_1", subjectCode: "ETHICS", kind: "TEXTBOOK" }],
  ["كتاب القواعد الرابع الابتدائي.pdf", { gradeCode: "PRI_4", subjectCode: "GRAMMAR", kind: "TEXTBOOK" }],
  ["كتاب الانكليزي الطالب الصف الرابع الابتدائي.pdf", { gradeCode: "PRI_4", subjectCode: "ENGLISH", kind: "TEXTBOOK" }],
  ["كتاب الانكليزي النشاط الصف الرابع الابتدائي.pdf", { gradeCode: "PRI_4", subjectCode: "ENGLISH", kind: "ACTIVITY" }],
  ["كتاب-الاجتماعيات-السادس-الابتدائي-kkwaajk.pdf", { gradeCode: "PRI_6", subjectCode: "SOCIAL", kind: "TEXTBOOK" }],
  ["كتاب-الانكليزي-الطالب-الملون-السادس-الابتدائي-7tyxz8b.pdf", { gradeCode: "PRI_6", subjectCode: "ENGLISH", kind: "TEXTBOOK" }],
  ["كتاب-القراءة-السادس-الابتدائي-uv64lmv (1).pdf", { gradeCode: "PRI_6", subjectCode: "READING", kind: "TEXTBOOK" }],
  // ملفات بلا صف في اسمها: الصف يبقى فارغاً ليختاره المستخدم (لا تخمين)
  ["انكليزي-omtob3b.pdf", { gradeCode: null, subjectCode: "ENGLISH", kind: "TEXTBOOK" }],
  ["نشاط-انكليزي-a7ggmr4.pdf", { gradeCode: null, subjectCode: "ENGLISH", kind: "ACTIVITY" }],
  // مراحل أخرى
  ["كتاب الفيزياء الخامس الاعدادي.pdf", { gradeCode: "PREP_5", subjectCode: "PHYSICS", kind: "TEXTBOOK" }],
  ["كتاب الرياضيات الثالث المتوسط.pdf", { gradeCode: "INT_3", subjectCode: "MATH", kind: "TEXTBOOK" }],
  ["كتاب الرياضيات الخامس المتوسط.pdf", { gradeCode: null, subjectCode: "MATH", kind: "TEXTBOOK" }],
  ["random-file.pdf", { gradeCode: null, subjectCode: null, kind: "TEXTBOOK" }],
];

describe("guessFromName", () => {
  it.each(cases)("%s", (name, expected) => expect(guessFromName(name)).toEqual(expected));
});

import { describe, expect, it } from "vitest";
import { guessFromCover, guessSubjectFromContent } from "./cover";

// نصوص أغلفة بأسلوب الكتب العراقية (استخراج PDF/OCR: ترتيب السطور قد يختلف، والتشكيل قد يوجد)
const cases: [string, string, { gradeCode: string | null; subjectCode: string | null; kind: string; confidence: string }][] = [
  ["رياضيات أول ابتدائي",
    "جمهورية العراق\nوزارة التربية\nالمديرية العامة للمناهج\nالرياضيات\nللصف الأول الابتدائي\nالطبعة الأولى 2026",
    { gradeCode: "PRI_1", subjectCode: "MATH", kind: "TEXTBOOK", confidence: "high" }],
  ["تمارين الرياضيات",
    "جمهورية العراق وزارة التربية\nتمارين الرياضيات\nللصف الأول الابتدائي",
    { gradeCode: "PRI_1", subjectCode: "MATH", kind: "EXERCISES", confidence: "high" }],
  ["القراءة (تؤخذ قبل العربية)",
    "وزارة التربية المديرية العامة للمناهج\nاللغة العربية\nالقراءة\nللصف الرابع الابتدائي",
    { gradeCode: "PRI_4", subjectCode: "READING", kind: "TEXTBOOK", confidence: "high" }],
  ["نشاط القراءة",
    "كتاب النشاط\nالقراءة\nللصف السادس الابتدائي",
    { gradeCode: "PRI_6", subjectCode: "READING", kind: "ACTIVITY", confidence: "high" }],
  ["القواعد",
    "القواعد\nللصف الخامس الابتدائي",
    { gradeCode: "PRI_5", subjectCode: "GRAMMAR", kind: "TEXTBOOK", confidence: "high" }],
  ["علوم مع تشكيل",
    "العُلُومُ\nلِلصَّفِّ الثَّانِي الابْتِدَائِيِّ",
    { gradeCode: "PRI_2", subjectCode: "SCIENCE", kind: "TEXTBOOK", confidence: "high" }],
  ["الاجتماعيات",
    "جمهورية العراق\nوزارة التربية\nالاجتماعيات\nللصف السادس الابتدائي",
    { gradeCode: "PRI_6", subjectCode: "SOCIAL", kind: "TEXTBOOK", confidence: "high" }],
  ["التربية الإسلامية",
    "التربية الإسلامية\nللصف الأول الابتدائي",
    { gradeCode: "PRI_1", subjectCode: "ISLAMIC", kind: "TEXTBOOK", confidence: "high" }],
  ["التربية الأخلاقية",
    "التربية الأخلاقية\nللصف الأول الابتدائي",
    { gradeCode: "PRI_1", subjectCode: "ETHICS", kind: "TEXTBOOK", confidence: "high" }],
  ["متوسط وإعدادي",
    "الفيزياء\nللصف الخامس الإعدادي", { gradeCode: "PREP_5", subjectCode: "PHYSICS", kind: "TEXTBOOK", confidence: "high" }],
  ["إنكليزي بغلاف إنكليزي (طالب)",
    "English for Iraq\nPrimary 4\nPupil's Book\nMinistry of Education Republic of Iraq",
    { gradeCode: "PRI_4", subjectCode: "ENGLISH", kind: "TEXTBOOK", confidence: "high" }],
  ["إنكليزي نشاط",
    "ENGLISH FOR IRAQ Primary 6 Activity Book Ministry of Education Republic of Iraq Ministry of Education Republic of Iraq",
    { gradeCode: "PRI_6", subjectCode: "ENGLISH", kind: "ACTIVITY", confidence: "high" }],
  ["إنكليزي بغلاف عربي",
    "اللغة الانكليزية\nكتاب الطالب\nللصف الرابع الابتدائي",
    { gradeCode: "PRI_4", subjectCode: "ENGLISH", kind: "TEXTBOOK", confidence: "high" }],
  // حالات ضعيفة تحتاج مراجعة بشرية
  ["بلا عبارة صف", "الرياضيات\nالفصل الأول: الأعداد", { gradeCode: null, subjectCode: "MATH", kind: "TEXTBOOK", confidence: "low" }],
  ["صفحة بلا معنى", "ثق بالله\n\n٣", { gradeCode: null, subjectCode: null, kind: "TEXTBOOK", confidence: "low" }],
];

describe("guessFromCover", () => {
  it.each(cases)("%s", (_n, text, expected) => expect(guessFromCover(text)).toMatchObject(expected));
  it("returns a short evidence snippet for the user to verify", () => {
    const g = guessFromCover("الرياضيات\n\nللصف الأول الابتدائي  " + "x".repeat(400));
    expect(g.evidence.length).toBeLessThanOrEqual(160);
    expect(g.evidence).toContain("الرياضيات للصف الأول الابتدائي");
  });
});

describe("guessSubjectFromContent (weak fallback)", () => {
  const rep = (w: string, n: number) => Array.from({ length: n }, () => w).join(" ");
  it("needs a clear majority of subject words and enough text", () => {
    const math = `${rep("اجمع العددين ثم اطرح الناتج وارسم المثلث والمربع", 12)} ${rep("نص عادي كثير من الكلمات المختلفة للحشو", 10)}`;
    expect(guessSubjectFromContent(math)).toBe("MATH");
    expect(guessSubjectFromContent(`${rep("النبات والحيوان والماء والهواء والطاقة", 10)} ${rep("حشو حشو حشو حشو حشو", 20)}`)).toBe("SCIENCE");
    expect(guessSubjectFromContent("جمع طرح")).toBeNull(); // نص قصير
    expect(guessSubjectFromContent(rep("كلمات عشوائية لا علاقة لها بمادة", 40))).toBeNull();
    expect(guessSubjectFromContent(rep("This is a long English text about my family and school day", 40))).toBe("ENGLISH");
  });
});

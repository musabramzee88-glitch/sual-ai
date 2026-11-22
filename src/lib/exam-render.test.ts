import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, renderExamHtml, richText, type RenderExam } from "./exam-render";

const exam: RenderExam = {
  lang: "AR",
  values: { title: "امتحان شهري", subject: "الرياضيات", grade: "الرابع الابتدائي", time: "٦٠ دقيقة", total: "٢٠" },
  sections: [
    { instruction: "اختر الإجابة الصحيحة لكل مما يأتي:", marks: 10, branches: [{ prompt: "ناتج 2x + 3x يساوي:", options: ["5x", "6x"], answer: "5x", marks: 5 }] },
    { instruction: "عرّف ما يأتي:", marks: 10, branches: [{ prompt: "<script>alert(1)</script> البناء الضوئي", options: null, answer: "عملية…", marks: 10 }] },
  ],
};

describe("exam renderer", () => {
  it("escapes all text (no HTML injection from AI or teacher)", () => {
    const html = renderExamHtml(exam, DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toMatch(/<\/?script/);
    expect(html).toContain("&lt;");
    expect(html).toContain("script&gt;alert(1)&lt;/script"); // يُعرض نصاً (ويُعزل كمقطع لاتيني)
  });
  it("isolates math inside Arabic, numbers questions the Iraqi way, and hides answers in the questions copy", () => {
    expect(richText("ناتج 2x + 3x يساوي")).toContain('<span class="ltr">2x + 3x</span>');
    const q = renderExamHtml(exam, DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    expect(q).toContain("س١/");
    expect(q).toContain("١-");
    expect(q).toContain("أ- ");
    expect(q).not.toContain("عملية…");
    expect(q).toContain("اسم الطالب");
    const key = renderExamHtml(exam, DEFAULT_TEMPLATE, "ANSWER_KEY");
    expect(key).toContain("الإجابات النموذجية");
    expect(key).toContain("عملية…");
    expect(key).not.toContain("اسم الطالب");
  });
  it("respects hidden fields, template values, answer lines, layout and page settings", () => {
    const tpl = { ...DEFAULT_TEMPLATE, layout: "ACADEMIC" as const, visible: { student: false, teacher: true }, values: { school: "مدرسة الرافدين", teacher: "أ. علي" }, answerLines: 2, pageSize: "A3" as const, orientation: "LANDSCAPE" as const };
    const html = renderExamHtml(exam, tpl, "QUESTIONS_ONLY", { forPdf: true });
    expect(html).not.toContain("اسم الطالب");
    expect(html).toContain("مدرسة الرافدين");
    expect(html).toContain("أ. علي");
    expect(html).toContain('class="cells"');
    expect((html.match(/class="rule"/g) ?? []).length).toBe(2); // فرع واحد مفتوح × سطران (الاختيار بلا أسطر)
    expect(html).toContain("size: A3 landscape; margin: 12mm");
  });
});

describe("per-exam values", () => {
  it("a value the teacher typed for this exam shows even if the field is hidden by default", () => {
    const base = renderExamHtml(exam, DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    expect(base).not.toContain("أ. زينب");
    const html = renderExamHtml({ ...exam, values: { ...exam.values, teacher: "أ. زينب" }, forceShow: ["teacher"] }, DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    expect(html).toContain("أ. زينب");
  });
});

describe("optional questions on the paper", () => {
  const two = (b: number) => Array.from({ length: b }, (_, i) => ({ prompt: `فرع ${i}`, options: null, answer: "أ", marks: 2 }));
  const ex = (over: Partial<RenderExam>): RenderExam => ({ lang: "AR", values: {}, sections: Array.from({ length: 6 }, (_, i) => ({ instruction: `تعليمة ${i}:`, marks: 20, branches: two(4) })), ...over });
  it("tells the student how many questions to answer and that the first is compulsory", () => {
    const html = renderExamHtml(ex({ sectionsToAnswer: 5, firstRequired: true }), DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    expect(html).toContain("ملاحظة: أجب عن (٥) أسئلة فقط من الأسئلة الآتية، والسؤال الأول إجباري.");
    expect(renderExamHtml(ex({ sectionsToAnswer: 5, firstRequired: false }), DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).not.toContain("إجباري");
    expect(renderExamHtml(ex({ sectionsToAnswer: 2 }), DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).toContain("أجب عن سؤالين فقط");
    expect(renderExamHtml(ex({ sectionsToAnswer: 1 }), DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).toContain("أجب عن سؤال واحد فقط");
    expect(renderExamHtml(ex({}), DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).not.toContain("ملاحظة: أجب");
    expect(renderExamHtml(ex({ sectionsToAnswer: 6 }), DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).not.toContain("ملاحظة: أجب"); // = الكل
  });
  it("tells how many branches to answer inside a section", () => {
    const e = ex({});
    e.sections[1].answerCount = 3;
    e.sections[2].answerCount = 2;
    e.sections[3].answerCount = 4; // = الكل
    const html = renderExamHtml(e, DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    expect(html).toContain("أجب عن (٣) فروع فقط مما يأتي:");
    expect(html).toContain("أجب عن فرعين فقط مما يأتي:");
    expect((html.match(/class="pick"/g) ?? []).length).toBe(2);
  });
});

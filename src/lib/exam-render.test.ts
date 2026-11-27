import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, renderExamHtml, richText, tableCells, tableStyleOf, type RenderExam, type RenderSection } from "./exam-render";

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

describe("compact layout", () => {
  const defs = (prompts: string[]) => ({ instruction: "عرّف ما يأتي:", marks: 10, branches: prompts.map((p) => ({ prompt: p, options: null, answer: "تعريف", marks: 2 })) });
  const e = (...sections: RenderSection[]): RenderExam => ({ lang: "AR", values: {}, sections });
  it("short items without options or answer space (definitions) flow horizontally, only in the questions copy", () => {
    const short = e(defs(["الكشف الكهربائي", "الموصلات", "العوازل", "الشحنة المقيدة"]));
    expect(renderExamHtml(short, DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).toContain('<ol class="inline">');
    expect(renderExamHtml(short, DEFAULT_TEMPLATE, "WITH_ANSWERS")).not.toContain('<ol class="inline">'); // الإجابة تحت كل فرع
    expect(renderExamHtml(short, { ...DEFAULT_TEMPLATE, answerLines: 2 }, "QUESTIONS_ONLY")).not.toContain('<ol class="inline">');
  });
  it("long items, single items and multiple-choice stay one per line", () => {
    expect(renderExamHtml(e(defs(["عرّف ما هو الكشف الكهربائي وما أنواعه وكيف يعمل في الدائرة", "الموصلات"])), DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).not.toContain('<ol class="inline">');
    expect(renderExamHtml(e(defs(["الموصلات"])), DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).not.toContain('<ol class="inline">');
    const mcq = e({ instruction: "اختر:", marks: 4, branches: [{ prompt: "أ", options: ["1", "2", "3"], answer: "1", marks: 2 }, { prompt: "ب", options: ["1", "2", "3"], answer: "1", marks: 2 }] });
    expect(renderExamHtml(mcq, DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).not.toContain('<ol class="inline">');
  });
  it("the closing line sits inside the content and is kept with the last question (never alone on a page)", () => {
    const html = renderExamHtml(e(defs(["عرّف الكشف الكهربائي وبيّن أنواعه وطريقة عمله", "علّل سبب انحراف ورقتي الكشاف عند تقريب جسم مشحون"])), DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    expect(html.indexOf('class="note"')).toBeLessThan(html.indexOf("</main>"));
    // الختام داخل كتلة .tail مع آخر فرع (لا تنقسم)، سواء القسم الأخير عمودي أو أفقي
    expect(html).toMatch(/<div class="tail"><ol><li>.*<\/li><\/ol><p class="note">/);
    expect(renderExamHtml(e(defs(["عرّف الكشف الكهربائي وبيّن أنواعه وطريقة عمله", "علّل سبب انحراف ورقتي الكشاف عند تقريب جسم مشحون"]), defs(["الموصلات", "العوازل", "الشحنة"])), DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).toMatch(/<div class="tail"><section[^>]*>.*<\/section><p class="note">/);
    expect((renderExamHtml(e(defs(["عرّف الكشف الكهربائي وبيّن أنواعه وطريقة عمله", "علّل سبب انحراف ورقتي الكشاف عند تقريب جسم مشحون"])), DEFAULT_TEMPLATE, "QUESTIONS_ONLY").match(/class="note"/g) ?? []).length).toBe(1);
    expect(renderExamHtml(e(defs(["عرّف الكشف الكهربائي وبيّن أنواعه وطريقة عمله", "علّل سبب انحراف ورقتي الكشاف عند تقريب جسم مشحون"])), DEFAULT_TEMPLATE, "ANSWER_KEY")).not.toContain('class="note"');
    expect(renderExamHtml(e(), DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).toContain('class="note"'); // بلا أقسام: تبقى بعد المحتوى
  });
});

describe("exam number and signature line", () => {
  const ex2: RenderExam = { lang: "AR", values: { subject: "العلوم", teacher: "أ. علي" }, sections: [{ instruction: "عرّف:", marks: 5, branches: [{ prompt: "عرّف الخلية وبيّن أجزاءها الرئيسة ووظيفة كل جزء منها", options: null, answer: "", marks: 5 }] }] };
  it("the exam number is hidden until enabled, then shows dots to fill (or its value)", () => {
    expect(renderExamHtml(ex2, DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).not.toContain("الرقم الامتحاني");
    const on = { ...DEFAULT_TEMPLATE, visible: { examNumber: true } };
    expect(renderExamHtml(ex2, on, "QUESTIONS_ONLY")).toContain("الرقم الامتحاني:</span> ............");
    expect(renderExamHtml({ ...ex2, values: { ...ex2.values, examNumber: "EX-12" } }, on, "QUESTIONS_ONLY")).toContain("EX-12");
    // قيمة كتبها المدرس لهذا الامتحان تظهر ولو كان الحقل مخفياً
    expect(renderExamHtml({ ...ex2, values: { ...ex2.values, examNumber: "7" }, forceShow: ["examNumber"] }, DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).toContain("الرقم الامتحاني");
  });
  it("the signature line sits beside the closing line, with the teacher name or dots", () => {
    const t = { ...DEFAULT_TEMPLATE, signLine: true };
    const html = renderExamHtml(ex2, t, "QUESTIONS_ONLY");
    expect(html).toContain('class="note foot"');
    expect(html).toContain("معلم/ة المادة: أ. علي");
    expect(renderExamHtml({ ...ex2, values: { subject: "العلوم" } }, t, "QUESTIONS_ONLY")).toContain("معلم/ة المادة: ................");
    expect(renderExamHtml(ex2, t, "ANSWER_KEY")).not.toContain("معلم/ة المادة");
    expect(renderExamHtml(ex2, DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).not.toContain("معلم/ة المادة");
    // الختام والتوقيع في كتلة .tail مع آخر فرع
    expect(html).toMatch(/<div class="tail"><ol>.*<\/ol><div class="note foot">/);
  });
});

describe("answer sheet and model answer letters", () => {
  const e3: RenderExam = {
    lang: "AR", values: { title: "اختبار", subject: "العلوم" },
    sections: [
      { instruction: "اختر:", marks: 8, type: "MCQ", branches: [{ prompt: "أ؟", options: ["أول", "ثاني", "ثالث"], answer: "ثاني", marks: 4 }, { prompt: "ب؟", options: ["أول", "ثاني", "ثالث", "رابع"], answer: "رابع", marks: 4 }] },
      { instruction: "صح أو خطأ:", marks: 4, type: "TRUE_FALSE", branches: [{ prompt: "عبارة", options: null, answer: "صح", marks: 4 }] },
      { instruction: "عرّف:", marks: 5, type: "DEFINE", branches: [{ prompt: "الخلية", options: null, answer: "وحدة", marks: 5 }] },
    ],
  };
  it("the answer sheet has circles only for objective items, numbered like the question paper, and no answers", () => {
    const html = renderExamHtml(e3, DEFAULT_TEMPLATE, "ANSWER_SHEET");
    expect(html).toContain("ورقة الإجابة");
    expect(html).toContain("اسم الطالب");
    expect((html.match(/class="cell"/g) ?? []).length).toBe(3); // اختياران + صح/خطأ (التعريف بلا دوائر)
    expect(html).toContain("س١ / ١");
    expect(html).toContain("س١ / ٢");
    expect(html).toContain("س٢ / ١");
    expect((html.match(/class="bub"/g) ?? []).length).toBe(3 + 4 + 2);
    expect(html).toContain("صح</span>");
    expect(html).not.toContain("وحدة");
    expect(html).not.toContain("مع تمنياتنا");
  });
  it("an exam without objective questions says so", () => {
    const none: RenderExam = { ...e3, sections: [e3.sections[2]] };
    expect(renderExamHtml(none, DEFAULT_TEMPLATE, "ANSWER_SHEET")).toContain("لا توجد أسئلة موضوعية");
  });
  it("answers of choice questions start with the right choice letter", () => {
    const key = renderExamHtml(e3, DEFAULT_TEMPLATE, "ANSWER_KEY");
    expect(key).toContain("ب- ثاني");
    expect(key).toContain("د- رابع");
    expect(key).toContain("صح</div>"); // غير الاختيار بلا حرف
    expect(renderExamHtml(e3, DEFAULT_TEMPLATE, "WITH_ANSWERS")).toContain("الإجابة:</span> ب- ثاني");
  });
});

describe("images and tables inside questions", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const mk = (b: Partial<RenderExam["sections"][0]["branches"][0]>): RenderExam => ({ lang: "AR", values: {}, sections: [{ instruction: "أجب:", marks: 5, branches: [{ prompt: "قصير", options: null, answer: "ج", marks: 5, ...b }, { prompt: "آخر", options: null, answer: "ج", marks: 0 }] }] });
  it("shows the image and table under the question (questions and with-answers), not in the key", () => {
    const e = mk({ image: PNG, table: { header: true, cells: [["الكمية", "القيمة"], ["", ""]] } });
    const q = renderExamHtml(e, DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    expect(q).toContain(`<img src="${PNG}"`);
    expect(q).toContain("<th>الكمية</th>");
    expect(q).toContain("<td></td>");
    expect(renderExamHtml(e, DEFAULT_TEMPLATE, "WITH_ANSWERS")).toContain('class="qimg"');
    expect(renderExamHtml(e, DEFAULT_TEMPLATE, "ANSWER_KEY")).not.toContain('class="qimg"');
    expect(renderExamHtml(e, DEFAULT_TEMPLATE, "ANSWER_SHEET")).not.toContain('class="qt"');
  });
  it("never injects HTML through table cells or a forged image source", () => {
    const e = mk({ image: 'javascript:alert(1)" onerror="x', table: { header: false, cells: [["<script>alert(1)</script>", "<img src=x onerror=1>"]] } });
    const html = renderExamHtml(e, DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    expect(html).not.toMatch(/<script|<img src=x|javascript:/);
    expect(html).not.toContain('class="qimg"'); // مصدر غير data:image/png|jpeg يُهمَل
    expect(html).toContain("&lt;script&gt;");
  });
  it("a branch with an image or table is not laid out horizontally", () => {
    expect(renderExamHtml(mk({}), DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).toContain('<ol class="inline">');
    expect(renderExamHtml(mk({ table: { header: false, cells: [["a"]] } }), DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).not.toContain('<ol class="inline">');
  });
});

describe("accent colour", () => {
  const ex3: RenderExam = { lang: "AR", values: { title: "اختبار" }, sections: [{ instruction: "أجب:", marks: 5, branches: [{ prompt: "ما هو؟ وما أنواعه الرئيسة في الطبيعة؟", options: null, answer: "", marks: 5 }] }] };
  it("defaults to black and takes a valid #rrggbb for frame and headings", () => {
    expect(renderExamHtml(ex3, DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).toContain("--ac: #000000");
    expect(renderExamHtml(ex3, { ...DEFAULT_TEMPLATE, accent: "#1e40af" }, "QUESTIONS_ONLY")).toContain("--ac: #1e40af");
  });
  it("ignores anything that is not a plain hex colour (no CSS injection)", () => {
    for (const bad of ["red", "#12", "#1e40af; background:url(//x)", "}</style><script>", "url(x)"]) {
      const html = renderExamHtml(ex3, { ...DEFAULT_TEMPLATE, accent: bad }, "QUESTIONS_ONLY");
      expect(html).toContain("--ac: #000000");
      expect(html).not.toContain("<script>");
    }
  });
});

describe("keeping a question on one page", () => {
  const sec = (n: number, len = 20): RenderExam["sections"][0] => ({ instruction: "قارن:", marks: 10, branches: Array.from({ length: n }, (_, i) => ({ prompt: "ا".repeat(len) + i, options: null, answer: "ج", marks: 2 })) });
  it("a normal question stays whole (class keep); a very long one may split between its items", async () => {
    const { keepTogether } = await import("./exam-render");
    expect(keepTogether(sec(4), "QUESTIONS_ONLY", 0)).toBe(true);
    expect(keepTogether(sec(30, 120), "QUESTIONS_ONLY", 0)).toBe(false);
    expect(keepTogether(sec(30, 120), "ANSWER_SHEET", 0)).toBe(false);
    const html = renderExamHtml({ lang: "AR", values: {}, sections: [sec(4), sec(30, 120)] }, DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    expect((html.match(/<section class="keep">/g) ?? []).length).toBe(1);
    expect(html).toContain("section.keep { break-inside: avoid; }");
  });
  it("answers and answer lines make a question taller, so fewer stay whole", async () => {
    const { keepTogether } = await import("./exam-render");
    const s = sec(8, 60);
    expect(keepTogether(s, "QUESTIONS_ONLY", 0)).toBe(true);
    expect(keepTogether(s, "QUESTIONS_ONLY", 4)).toBe(false); // أسطر إجابة تحت كل فرع
  });
});

describe("fit profiles (shrinking to fit a page limit)", () => {
  it("step 0 is the template untouched; later steps only shrink, never below the readable minimums", async () => {
    const { fitProfile, FIT_STEPS } = await import("./exam-render");
    expect(fitProfile(DEFAULT_TEMPLATE, 0)).toBe(DEFAULT_TEMPLATE);
    let prev = DEFAULT_TEMPLATE;
    for (let k = 1; k <= FIT_STEPS; k++) {
      const t = fitProfile(DEFAULT_TEMPLATE, k);
      expect(t.fontSizePt).toBeLessThanOrEqual(prev.fontSizePt);
      expect(t.lineSpacing).toBeLessThanOrEqual(prev.lineSpacing);
      expect(t.gap ?? 1).toBeLessThanOrEqual(prev.gap ?? 1);
      expect(t.fontSizePt).toBeGreaterThanOrEqual(11);
      expect(t.lineSpacing).toBeGreaterThanOrEqual(1.3);
      expect(t.gap ?? 1).toBeGreaterThanOrEqual(0.55);
      expect(Math.min(t.margins.top, t.margins.bottom)).toBeGreaterThanOrEqual(8);
      expect(Math.min(t.margins.left, t.margins.right)).toBeGreaterThanOrEqual(9);
      prev = t;
    }
  });
  it("never enlarges a template that is already small", async () => {
    const { fitProfile } = await import("./exam-render");
    const small = { ...DEFAULT_TEMPLATE, fontSizePt: 10, lineSpacing: 1.2, margins: { top: 6, right: 7, bottom: 6, left: 7 } };
    const t = fitProfile(small, 8);
    expect(t.fontSizePt).toBe(10);
    expect(t.lineSpacing).toBeLessThanOrEqual(1.2);
    expect(t.margins).toEqual(small.margins);
  });
  it("the spacing factor reaches the page CSS, and browser print keeps margins on every page (spacer rows)", () => {
    const e: RenderExam = { lang: "AR", values: {}, sections: [{ instruction: "أ:", marks: 1, branches: [{ prompt: "ما هو الجواب الصحيح لهذا السؤال الطويل", options: null, answer: "", marks: 1 }] }] };
    expect(renderExamHtml(e, { ...DEFAULT_TEMPLATE, gap: 0.7 }, "QUESTIONS_ONLY")).toContain("--g: 0.7");
    const print = renderExamHtml(e, DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    expect(print).toContain('<table class="pg"><thead>');
    expect(print).toContain("<tfoot>");
    expect(print).toContain(".sp-t { height: 12mm; }");
    const pdf = renderExamHtml(e, DEFAULT_TEMPLATE, "QUESTIONS_ONLY", { forPdf: true });
    expect(pdf).not.toContain('class="pg"'); // PDF: الهوامش من @page
    expect(pdf).toContain("margin: 12mm 14mm 12mm 14mm");
  });
  it("splitting a question is allowed only when keepSections is false", () => {
    const sec = { instruction: "قارن:", marks: 10, branches: Array.from({ length: 4 }, (_, i) => ({ prompt: "ا".repeat(20) + i, options: null, answer: "ج", marks: 2 })) };
    const e: RenderExam = { lang: "AR", values: {}, sections: [sec] };
    expect(renderExamHtml(e, DEFAULT_TEMPLATE, "QUESTIONS_ONLY")).toContain('<section class="keep">');
    expect(renderExamHtml(e, { ...DEFAULT_TEMPLATE, keepSections: false }, "QUESTIONS_ONLY")).not.toContain('<section class="keep">');
  });
});

describe("table styles", () => {
  const base = { header: true, cells: [["العمود (أ)", "العمود (ب)"], ["١- القلب", "أ- ضخ الدم"], ["٢- الرئتان", ""]] };
  const exam = (style?: string): RenderExam => ({ lang: "AR", values: {}, sections: [{ instruction: "صِل:", marks: 5, type: "MATCHING", branches: [{ prompt: "صِل.", options: null, answer: "x", marks: 5, table: { ...base, ...(style ? { style } : {}) } as never }] }] });
  const html = (style?: string, v: "QUESTIONS_ONLY" | "ANSWER_KEY" = "QUESTIONS_ONLY") => renderExamHtml(exam(style), DEFAULT_TEMPLATE, v);

  it("an unknown or missing style is a bordered grid", () => {
    expect(tableStyleOf(undefined)).toBe("GRID");
    expect(tableStyleOf({ style: "SPARKLES" })).toBe("GRID");
    expect(html()).toContain('<table class="qt">');
    expect(html("SPARKLES")).toContain('<table class="qt">');
  });

  it("PLAIN drops the border class, BLANKS also adds brackets to the last column (not the header or empty cells)", () => {
    expect(html("PLAIN")).toContain('<table class="qt plain">');
    expect(html("PLAIN")).not.toContain("(\u00A0");
    const b = html("BLANKS");
    expect(b).toContain('<table class="qt plain">');
    expect((b.match(/\(\u00A0{6}\)/g) ?? []).length).toBe(1); // الخلية الفارغة والعنوان بلا قوس
    expect(tableCells({ ...base, style: "BLANKS" } as never)[1]).toEqual(["١- القلب", "(\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0)\u00A0أ- ضخ الدم"]);
    expect(tableCells({ ...base, style: "PLAIN" } as never)).toBe(base.cells);
  });

  it("the style changes only the questions paper, never the answer key", () => {
    expect(html("BLANKS", "ANSWER_KEY")).not.toContain("<table class=\"qt");
  });
});

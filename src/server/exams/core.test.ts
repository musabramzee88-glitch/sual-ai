import { describe, expect, it } from "vitest";
import { buildPrompt, cleanPassage, cleanQuestion, createExamSchema, expandRanges, pickImagePages, sortIntoSections } from "./core";

const pages = new Set([10, 11, 12]);

describe("exam input", () => {
  it("requires chapters or a page range, caps questions, refuses duplicate sections", () => {
    const base = { curriculumId: "c".repeat(20), sections: [{ type: "MCQ", count: 5, marksEach: 2 }] };
    expect(createExamSchema.safeParse(base).success).toBe(false);
    expect(createExamSchema.safeParse({ ...base, pageFrom: 10, pageTo: 20 }).success).toBe(true);
    expect(createExamSchema.safeParse({ ...base, chapterIds: ["x".repeat(20)] }).success).toBe(true);
    expect(createExamSchema.safeParse({ ...base, pageFrom: 10, pageTo: 5 }).success).toBe(false);
    expect(createExamSchema.safeParse({ ...base, pageFrom: 1, pageTo: 2, sections: [{ type: "MCQ", count: 20, marksEach: 1 }, { type: "ESSAY", count: 20, marksEach: 1 }, { type: "DEFINE", count: 1, marksEach: 1 }] }).success).toBe(false);
    expect(createExamSchema.safeParse({ ...base, pageFrom: 1, pageTo: 2, sections: [{ type: "MCQ", count: 2, marksEach: 1 }, { type: "MCQ", count: 2, marksEach: 1 }] }).success).toBe(false);
  });
});

describe("question cleaning", () => {
  it("MCQ: answer must be one of the options (verbatim, by letter, or normalized)", () => {
    expect(cleanQuestion({ prompt: "عاصمة العراق", options: ["بغداد", "البصرة", "أربيل", "الموصل"], answer: "بغداد", sourcePages: [10] }, "MCQ", pages, "AR")?.answer).toBe("بغداد");
    expect(cleanQuestion({ prompt: "عاصمة العراق", options: ["بغداد", "البصرة", "أربيل", "الموصل"], answer: "أ)", sourcePages: [10] }, "MCQ", pages, "AR")?.answer).toBe("بغداد");
    expect(cleanQuestion({ prompt: "عاصمة العراق", options: ["بغداد", "البصرة", "أربيل", "الموصل"], answer: "دمشق", sourcePages: [10] }, "MCQ", pages, "AR")).toBeNull();
    expect(cleanQuestion({ prompt: "عاصمة العراق", options: ["بغداد", "بغداد"], answer: "بغداد", sourcePages: [10] }, "MCQ", pages, "AR")).toBeNull();
  });
  it("every question must cite a page inside the source range", () => {
    expect(cleanQuestion({ prompt: "عرّف الخلية", answer: "وحدة بناء…", sourcePages: [99] }, "DEFINE", pages, "AR")).toBeNull();
    expect(cleanQuestion({ prompt: "عرّف الخلية", answer: "وحدة بناء…", sourcePages: [] }, "DEFINE", pages, "AR")).toBeNull();
    expect(cleanQuestion({ prompt: "عرّف الخلية", answer: "وحدة بناء…", sourcePages: [12, 99, 12] }, "DEFINE", pages, "AR")?.sourcePages).toEqual([12]);
  });
  it("TRUE_FALSE answers are normalized, keeping the correction for false statements", () => {
    expect(cleanQuestion({ prompt: "الماء يغلي عند 100", answer: "صحيح", sourcePages: [10] }, "TRUE_FALSE", pages, "AR")?.answer).toBe("صح");
    expect(cleanQuestion({ prompt: "الشمس كوكب", answer: "خطأ - الشمس نجم", sourcePages: [10] }, "TRUE_FALSE", pages, "AR")?.answer).toBe("خطأ — الشمس نجم");
    expect(cleanQuestion({ prompt: "x", answer: "ربما", sourcePages: [10] }, "TRUE_FALSE", pages, "AR")).toBeNull();
    expect(cleanQuestion({ prompt: "The sun is a star", answer: "true", sourcePages: [10] }, "TRUE_FALSE", pages, "EN")?.answer).toBe("True");
  });
});

describe("sorting the model response into sections", () => {
  it("drops duplicates, wrong section indexes and extras beyond the requested count", () => {
    const sections = [{ type: "DEFINE" as const, count: 2, marksEach: 2 }, { type: "JUSTIFY" as const, count: 1, marksEach: 3 }];
    const raw = [
      { section: 0, prompt: "عرّف الخلية", answer: "a", sourcePages: [10] },
      { section: 0, prompt: "عرّف  الخلية", answer: "a", sourcePages: [11] }, // مكرر
      { section: 0, prompt: "عرّف النسيج", answer: "b", sourcePages: [11] },
      { section: 0, prompt: "عرّف العضو", answer: "c", sourcePages: [12] }, // زائد
      { section: 5, prompt: "?", answer: "x", sourcePages: [10] },
      { section: 1, prompt: "علّل: تحتاج النباتات للضوء", answer: "للبناء الضوئي", sourcePages: [12] },
    ];
    const r = sortIntoSections(raw, sections, pages, "AR");
    expect(r.bySection.map((s) => s.length)).toEqual([2, 1]);
    expect(r.dropped).toBe(3);
  });
});

describe("source pages", () => {
  it("expands chapter ranges, merges overlaps, samples across the whole range when too long", () => {
    expect(expandRanges([{ from: 5, to: 7 }, { from: 6, to: 9 }], 100)).toEqual({ pages: [5, 6, 7, 8, 9], truncated: false });
    const big = expandRanges([{ from: 1, to: 200 }], 200, 10);
    expect(big.truncated).toBe(true);
    expect(big.pages).toHaveLength(10);
    expect(big.pages[big.pages.length - 1]).toBeGreaterThan(150);
  });
  it("prefers OCR/weak pages for images, spread evenly", () => {
    const ps = Array.from({ length: 20 }, (_, i) => ({ pageNumber: i + 1, isOcr: i % 2 === 0, textLen: 500 }));
    const img = pickImagePages(ps, 4);
    expect(img.size).toBe(4);
    expect([...img].every((n) => n % 2 === 1)).toBe(true);
  });
  it("the prompt lists sections, page markers, and flags image/OCR pages", () => {
    const p = buildPrompt({ subject: "العلوم", grade: "الخامس الابتدائي", lang: "AR", difficulty: "MIXED", useLatinSymbols: false, sections: [{ type: "MCQ", count: 3, marksEach: 1 }], pages: [{ pageNumber: 10, text: "الخلية", isOcr: false, asImage: false }, { pageNumber: 11, text: "", isOcr: true, asImage: true }] });
    expect(p).toContain("section 0: MCQ × 3");
    expect(p).toContain("=== صفحة 10 ===\nالخلية");
    expect(p).toContain("Pages 11 are attached as IMAGES");
  });
});

describe("subject question types and verbatim texts", async () => {
  const { SUBJECT_TYPES, QUESTION_TYPES, QT, GENERATABLE_TYPES } = await import("@/lib/question-types");
  const { verbatimOk } = await import("./core");

  it("every subject's types exist in the catalog, have Arabic and English instructions, and Islamic education has its Iraqi styles", () => {
    for (const [code, types] of Object.entries(SUBJECT_TYPES)) {
      expect(types.length, code).toBeGreaterThan(3);
      for (const t of types) expect(QUESTION_TYPES, `${code}:${t}`).toContain(t);
      expect(new Set(types).size, code).toBe(types.length);
    }
    for (const t of GENERATABLE_TYPES) expect(QT[t].instAr && QT[t].instEn && QT[t].hint, t).toBeTruthy();
    expect(SUBJECT_TYPES.ISLAMIC).toEqual(expect.arrayContaining(["COMPLETE_VERSE", "WRITE_VERSE", "EXPLAIN_VERSE", "WRITE_HADITH", "WORD_MEANINGS", "LESSONS", "TAJWEED"]));
    expect(SUBJECT_TYPES.GRAMMAR).toEqual(expect.arrayContaining(["GRAMMAR_PARSING", "EXTRACT", "CONVERT", "CORRECT_ERROR"]));
    expect(SUBJECT_TYPES.READING).toEqual(expect.arrayContaining(["COMPREHENSION", "WORD_MEANINGS", "WORD_FORMS", "COMPLETE_POEM"]));
    expect(SUBJECT_TYPES.ENGLISH).toEqual(expect.arrayContaining(["REORDER", "VERB_FORMS", "MATCHING", "COMPREHENSION", "WRITING"]));
    expect(SUBJECT_TYPES.MATH).toEqual(expect.arrayContaining(["COMPUTE", "PROBLEM"]));
    expect(SUBJECT_TYPES.CHEMISTRY).toContain("EQUATION_BALANCING");
    expect(SUBJECT_TYPES.COMPUTER).toContain("ALGORITHM");
    expect(SUBJECT_TYPES.ETHICS).toContain("SITUATION");
  });

  const page = { text: "قال تعالى: ﴿ وَاعْتَصِمُوا بِحَبْلِ اللَّهِ جَمِيعًا وَلَا تَفَرَّقُوا ﴾ صدق الله العظيم", trusted: true };
  const pages = new Map([[5, page], [6, { text: "", trusted: false }]]);

  it("a completed verse must match the book text (diacritics ignored); a misquote is dropped", () => {
    expect(verbatimOk("واعتصموا بحبل الله جميعا ولا تفرقوا", [5], pages)).toBe(true);
    expect(verbatimOk("واعتصموا بحبل الله جميعا ولا تنازعوا فتفشلوا", [5], pages)).toBe(false);
    expect(cleanQuestion({ prompt: "وَاعْتَصِمُوا بِحَبْلِ اللَّهِ ......", answer: "جَمِيعًا وَلَا تَفَرَّقُوا", sourcePages: [5] }, "COMPLETE_VERSE", pages, "AR")).not.toBeNull();
    expect(cleanQuestion({ prompt: "وَاعْتَصِمُوا بِحَبْلِ اللَّهِ ......", answer: "جميعا ولا تنازعوا فتفشلوا وتذهب ريحكم", sourcePages: [5] }, "COMPLETE_VERSE", pages, "AR")).toBeNull();
  });
  it("pages read from images cannot be checked automatically: kept (the teacher is told to verify)", () => {
    expect(cleanQuestion({ prompt: "أكمل: ......", answer: "أي نص", sourcePages: [6] }, "WRITE_HADITH", pages, "AR")).not.toBeNull();
  });
});

describe("reference papers", async () => {
  const { chooseInstruction, buildPrompt } = await import("./core");
  it("uses the teachers' instruction wording when reference papers exist and the wording is sane", () => {
    expect(chooseInstruction("DEFINE", "AR", "س٢/ عرّف المصطلحات العلمية الآتية:", true)).toBe("عرّف المصطلحات العلمية الآتية:");
    expect(chooseInstruction("DEFINE", "AR", "عرّف المصطلحات العلمية الآتية:", false)).toBe("عرّف ما يأتي:"); // بلا أوراق مرجع: الافتراضية
    expect(chooseInstruction("DEFINE", "AR", "Define:", true)).toBe("عرّف ما يأتي:"); // لغة خاطئة
    expect(chooseInstruction("DEFINE", "AR", "", true)).toBe("عرّف ما يأتي:");
  });
  it("puts the reference papers in the prompt with a do-not-copy rule", () => {
    const p = buildPrompt({ subject: "العلوم", grade: "الخامس", lang: "AR", difficulty: "MIXED", useLatinSymbols: false, sections: [{ type: "DEFINE", count: 2, marksEach: 2 }], pages: [{ pageNumber: 3, text: "نص", isOcr: false, asImage: false }], samples: ["س١/ عرّف المصطلحات العلمية الآتية: ١- الخلية"] });
    expect(p).toContain("reference paper 1");
    expect(p).toContain("س١/ عرّف المصطلحات العلمية الآتية");
    expect(p).toContain("NEVER copy their questions");
  });
});

describe("verses printed in Uthmani script match the model's plain spelling", async () => {
  const { verbatimOk } = await import("./core");
  // رسم عثماني كما في الكتب: ألف وصل، ألف خنجرية، علامات وقف، همزة مفردة
  const book = "قال تعالى: ﴿ وَٱعْتَصِمُوا۟ بِحَبْلِ ٱللَّهِ جَمِيعًا وَلَا تَفَرَّقُوا۟ ۚ وَٱذْكُرُوا۟ نِعْمَتَ ٱللَّهِ عَلَيْكُمْ إِذْ كُنتُمْ أَعْدَآءً فَأَلَّفَ بَيْنَ قُلُوبِكُمْ ﴾ ٱلرَّحْمَـٰنُ ۞ سَلَـٰمٌ هِىَ";
  const pages = new Map([[7, { text: book, trusted: true }]]);
  it("accepts the same verse in plain spelling", () => {
    expect(verbatimOk("واعتصموا بحبل الله جميعا ولا تفرقوا واذكروا نعمة الله عليكم", [7], pages)).toBe(true);
    // الرسم العثماني يحذف بعض الألفات («سلم» لا «سلام»): كلمة مختلفة من ثمان تُحتمل (حد 85%)
    expect(verbatimOk("الرحمن سلام هي واذكروا الله جميعا بحبل ولا", [7], pages)).toBe(true);
  });
  it("still rejects a misquote", () => {
    expect(verbatimOk("واعتصموا بحبل الله جميعا ولا تنازعوا فتفشلوا وتذهب ريحكم", [7], pages)).toBe(false);
  });
});

describe("surah-range memorisation question", async () => {
  const { cleanQuestion } = await import("./core");
  const { SUBJECT_TYPES, VERBATIM_TYPES, QT } = await import("@/lib/question-types");
  const book = "سُورَةُ ٱلْكَوْثَرِ بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ ﴿١﴾ إِنَّآ أَعْطَيْنَـٰكَ ٱلْكَوْثَرَ ﴿٢﴾ فَصَلِّ لِرَبِّكَ وَٱنْحَرْ ﴿٣﴾ إِنَّ شَانِئَكَ هُوَ ٱلْأَبْتَرُ";
  const pages = new Map([[3, { text: book, trusted: true }]]);
  it("is the first Islamic-education type, instruction mentions from-verse-to-verse, and is verified verbatim", () => {
    expect(SUBJECT_TYPES.ISLAMIC[0]).toBe("SURAH_RANGE");
    expect(VERBATIM_TYPES).toContain("SURAH_RANGE");
    expect(QT.SURAH_RANGE.instAr).toContain("من الآية إلى الآية");
  });
  it("keeps a correct range copied from the book and drops a range with wrong text", () => {
    const ok = cleanQuestion({ prompt: "سورة (الكوثر) من الآية (٢) إلى الآية (٣)", answer: "إنا أعطيناك الكوثر فصل لربك وانحر", sourcePages: [3] }, "SURAH_RANGE", pages, "AR");
    expect(ok?.prompt).toContain("من الآية");
    expect(cleanQuestion({ prompt: "سورة (الكوثر) من الآية (٢) إلى الآية (٣)", answer: "إنا أعطيناك الكوثر فصل لربك وأنحر الذبائح وأطعم الفقراء", sourcePages: [3] }, "SURAH_RANGE", pages, "AR")).toBeNull();
  });
});

describe("matching questions become a two-column table", () => {
  const pages = new Set([5]);
  const raw = (extra: object) => ({ section: 0, prompt: "Match the jobs with their places of work.", answer: "1-c, 2-a, 3-b", sourcePages: [5], ...extra });
  const A = ["Waiter", "IT programmer", "Doctor"], B = ["Farm", "Office", "Hospital"];

  it("builds the table with numbered and lettered cells (English)", () => {
    const q = cleanQuestion(raw({ columnA: A, columnB: B }), "MATCHING", pages, "EN")!;
    expect(q.table).toEqual({ header: true, cells: [["Column A", "Column B"], ["1. Waiter", "a. Farm"], ["2. IT programmer", "b. Office"], ["3. Doctor", "c. Hospital"]] });
    expect(q.prompt).toBe("Match the jobs with their places of work.");
  });

  it("Arabic uses Arabic-Indic digits and Arabic letters, and an extra distractor fits", () => {
    const q = cleanQuestion(raw({ prompt: "صِل بين المصطلح وتعريفه.", columnA: ["أ", "ب", "ج"].map((x) => `مصطلح ${x}`), columnB: ["تعريف ١", "تعريف ٢", "تعريف ٣", "زائد"] }), "MATCHING", pages, "AR")!;
    expect(q.table!.cells[0]).toEqual(["العمود (أ)", "العمود (ب)"]);
    expect(q.table!.cells[1][0]).toBe("١- مصطلح أ");
    expect(q.table!.cells[1][1]).toBe("أ- تعريف ١");
    expect(q.table!.cells[4]).toEqual(["", "د- زائد"]);
  });

  it("strips numbering the model added anyway and cuts columns written inside the prompt", () => {
    const q = cleanQuestion(raw({ prompt: "Match the jobs in Column A with places in Column B: Column A: 1. Waiter, 2. Doctor. Column B: a. Farm", columnA: ["1. Waiter", "2) IT programmer", "3- Doctor"], columnB: ["a. Farm", "b) Office", "c- Hospital"] }), "MATCHING", pages, "EN")!;
    expect(q.table!.cells[1]).toEqual(["1. Waiter", "a. Farm"]);
    expect(q.prompt).toBe("Match the jobs in Column A with places in Column B.");
  });

  it("without usable columns the old inline behaviour stays (no table)", () => {
    const q = cleanQuestion(raw({ prompt: "Match: Column A: 1. x 2. y 3. z Column B: a. p b. q c. r" }), "MATCHING", pages, "EN")!;
    expect(q.table).toBeNull();
    expect(q.prompt).toContain("Column A");
    for (const bad of [{ columnA: ["x", "y"], columnB: ["p", "q"] }, { columnA: A, columnB: ["p", "q"] }, { columnA: A, columnB: ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"] }]) {
      expect(cleanQuestion(raw(bad), "MATCHING", pages, "EN")!.table).toBeNull();
    }
  });

  it("other types never get a table", () => {
    expect(cleanQuestion(raw({ columnA: A, columnB: B, prompt: "Define it.", answer: "It is.", }), "DEFINE", pages, "EN")!.table).toBeNull();
  });
});

describe("unseen passage (English)", () => {
  const good = "Ali lives in a small village near a river. Every morning he walks to school with his sister Sara, and they talk about their lessons. After school he helps his father on the farm, where they grow tomatoes and cucumbers.\n\nOn Fridays the family visits the market in the nearby town. Ali likes to buy fresh bread and sweets for his little brother. In the evening they all sit together, eat dinner, and listen to his grandfather's old stories about the village.";
  const pages = new Set([5]);

  it("accepts a proper English passage and tidies paragraphs", () => {
    expect(cleanPassage(good, "EN")).toBe(good);
    expect(cleanPassage(good.replace("\n\n", "\n\n\n\n  "), "EN")).toBe(good);
  });

  it("rejects too short, too long, wrong language, and empty passages", () => {
    expect(cleanPassage("Too short.", "EN")).toBeNull();
    expect(cleanPassage(good.repeat(6), "EN")).toBeNull();
    expect(cleanPassage(null, "EN")).toBeNull();
    expect(cleanPassage("هذه قطعة عربية طويلة ".repeat(30), "EN")).toBeNull();
    expect(cleanPassage("هذه قطعة عربية جميلة تتحدث عن القرية والنهر والمدرسة ".repeat(8), "AR")).not.toBeNull();
  });

  it("questions about the passage need no source page, and may be multiple choice", () => {
    const q = cleanQuestion({ section: 0, prompt: "Where does Ali live?", answer: "He lives in a small village near a river.", sourcePages: [] }, "UNSEEN_PASSAGE", pages, "EN");
    expect(q).toMatchObject({ prompt: "Where does Ali live?", options: null });
    const mc = cleanQuestion({ section: 0, prompt: "Ali goes to school with:", options: ["his sister", "his brother", "his father"], answer: "his sister", sourcePages: [] }, "UNSEEN_PASSAGE", pages, "EN");
    expect(mc!.options).toHaveLength(3);
    expect(cleanQuestion({ section: 0, prompt: "Ali goes to school with:", options: ["a", "b"], answer: "a", sourcePages: [] }, "UNSEEN_PASSAGE", pages, "EN")).toBeNull(); // خياران لا يكفيان
    // الأنواع الأخرى ما زالت تشترط صفحة مصدر
    expect(cleanQuestion({ section: 0, prompt: "Define it.", answer: "It is.", sourcePages: [] }, "DEFINE", pages, "EN")).toBeNull();
  });

  it("the prompt asks for a new passage, or forbids one when it is already printed", () => {
    const base = { subject: "English", grade: "Sixth Primary", lang: "EN" as const, difficulty: "MIXED" as const, useLatinSymbols: false, pages: [{ pageNumber: 5, text: "Unit 1 text", isOcr: false, asImage: false }] };
    const sections = [{ type: "UNSEEN_PASSAGE" as const, count: 5, marksEach: 2 }];
    const fresh = buildPrompt({ ...base, sections });
    expect(fresh).toContain("UNSEEN passage");
    expect(fresh).toContain("The ONLY exception");
    expect(fresh).not.toContain("ALREADY PRINTED");
    const more = buildPrompt({ ...base, sections, passage: good });
    expect(more).toContain("ALREADY PRINTED");
    expect(more).toContain("Ali lives in a small village");
  });
});

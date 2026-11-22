import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// النموذج مُحاكى: يعيد أسئلة ثابتة (بعضها خاطئ عمداً) ويسجّل ما أُرسل له
const calls: { prompt: string; images: number }[] = [];
let reply: unknown = null;
vi.mock("../ai/gemini", async (orig) => {
  const real = await orig<typeof import("../ai/gemini")>();
  return {
    ...real,
    currentModel: () => "mock-model",
    geminiJson: vi.fn(async (o: { prompt: string; images?: unknown[] }) => {
      calls.push({ prompt: o.prompt, images: o.images?.length ?? 0 });
      if (reply instanceof Error) throw reply;
      return reply;
    }),
  };
});

const { db } = await import("../db");
const { createExam, getExam, editQuestion, regenerateQuestion, undoQuestion, deleteQuestion, examOptions, updateSection, addManualQuestion, reorderQuestions, reorderSections, deleteSection, addSection, generateMore, updateExamMeta, distributeExamMarks, duplicateQuestion, duplicateSection, listStructures } = await import("./service");
const { AiError } = await import("../ai/gemini");

const TAG = `ex${Date.now()}`;
const YEAR = "2091-2092";
let userId = "", otherId = "", curId = "", bookId = "", chapterId = "", prevCurrent: string | null = null;

beforeAll(async () => {
  prevCurrent = (await db.academicYear.findFirst({ where: { isCurrent: true } }))?.id ?? null;
  await db.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
  const year = await db.academicYear.create({ data: { label: YEAR, startsOn: new Date("2091-09-01"), endsOn: new Date("2092-06-30"), isCurrent: true } });
  const [track, grade, subject] = await Promise.all([
    db.curriculumTrack.findUniqueOrThrow({ where: { code: "GENERAL" } }),
    db.grade.findUniqueOrThrow({ where: { code: "PRI_5" } }),
    db.subject.findUniqueOrThrow({ where: { code: "SCIENCE" } }),
  ]);
  const cur = await db.curriculum.create({ data: { trackId: track.id, gradeId: grade.id, subjectId: subject.id, academicYearId: year.id, title: "علوم اختبار", chapters: { create: [{ sortOrder: 1, title: "الفصل الأول: النبات", pageStart: 10, pageEnd: 12 }] } }, include: { chapters: true } });
  curId = cur.id;
  chapterId = cur.chapters[0].id;
  const book = await db.uploadedBook.create({ data: { ownerId: null, curriculumId: cur.id, originalName: "s.pdf", storageKey: `books/${TAG}.pdf`, mimeType: "application/pdf", sizeBytes: 1, sha256: TAG, status: "READY", pageCount: 20 } });
  bookId = book.id;
  await db.bookPage.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ bookId, pageNumber: i + 1, text: `صفحة ${i + 1}: النبات يصنع غذاءه بعملية البناء الضوئي ويحتاج الضوء والماء وثنائي أكسيد الكربون.`, isOcr: false })) });
  userId = (await db.user.create({ data: { fullName: "مدرس", email: `${TAG}@example.test`, phone: `+96477${String(Date.now()).slice(-8)}`, passwordHash: "x" } })).id;
  otherId = (await db.user.create({ data: { fullName: "آخر", email: `${TAG}b@example.test`, phone: `+96476${String(Date.now()).slice(-8)}`, passwordHash: "x" } })).id;
});

afterAll(async () => {
  await db.exam.deleteMany({ where: { ownerId: { in: [userId, otherId] } } });
  await db.uploadedBook.deleteMany({ where: { id: bookId } });
  await db.curriculum.deleteMany({ where: { id: curId } });
  await db.academicYear.deleteMany({ where: { label: YEAR } });
  if (prevCurrent) await db.academicYear.update({ where: { id: prevCurrent }, data: { isCurrent: true } });
  await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await db.$disconnect();
});

const q = (section: number, prompt: string, extra: Record<string, unknown> = {}) => ({ section, prompt, answer: "البناء الضوئي", sourcePages: [10], ...extra });

describe("exam generation", () => {
  it("lists curricula that have a ready book, with chapters", async () => {
    const o = (await examOptions()).find((c) => c.id === curId)!;
    expect(o.pageCount).toBe(20);
    expect(o.chapters[0].title).toContain("النبات");
  });

  it("generates from the chosen chapter only, keeps valid questions, drops ungrounded/broken ones, sums marks", async () => {
    reply = { questions: [
      q(0, "ما العملية التي يصنع بها النبات غذاءه؟", { options: ["البناء الضوئي", "التنفس", "الهضم", "النتح"] }),
      q(0, "يحتاج النبات للضوء من أجل:", { options: ["البناء الضوئي", "النمو", "الإزهار", "الذبول"], sourcePages: [55] }), // خارج النطاق ⇒ يسقط
      q(0, "سؤال خياراته ناقصة", { options: ["أ", "ب"] }), // يسقط
      q(1, "عرّف البناء الضوئي", { answer: "عملية يصنع بها النبات غذاءه", sourcePages: [11, 12] }),
    ] };
    const r = await createExam(userId, { curriculumId: curId, chapterIds: [chapterId], kind: "QUIZ", difficulty: "MIXED", sections: [{ type: "MCQ", count: 2, marksEach: 2 }, { type: "DEFINE", count: 1, marksEach: 4 }] });
    if (!r.ok) throw new Error(r.code);
    expect([r.made, r.requested]).toEqual([2, 3]);
    // أُرسلت صفحات الفصل فقط (10–12)
    expect(calls.at(-1)!.prompt).toContain("=== صفحة 10 ===");
    expect(calls.at(-1)!.prompt).toContain("=== صفحة 12 ===");
    expect(calls.at(-1)!.prompt).not.toContain("=== صفحة 13 ===");
    const e = (await getExam(userId, r.examId))!;
    expect(e.status).toBe("READY");
    expect(e.totalMarks).toBe(6);
    expect(e.sections.map((s) => [s.type, s.branches.length, s.marks])).toEqual([["MCQ", 1, 2], ["DEFINE", 1, 4]]);
    expect(e.sections[0].instruction).toContain("اختر الإجابة الصحيحة");
    expect(e.sections[1].branches[0].sourcePages).toEqual([11, 12]);
    expect(await getExam(otherId, r.examId)).toBeNull(); // لا يرى امتحان غيره
  });

  it("MCQ edits keep the answer among the options", async () => {
    reply = { questions: [q(0, "ما العملية؟", { options: ["البناء الضوئي", "التنفس", "الهضم", "النتح"] })] };
    const r = await createExam(userId, { curriculumId: curId, pageFrom: 10, pageTo: 12, kind: "QUIZ", difficulty: "EASY", sections: [{ type: "MCQ", count: 1, marksEach: 1 }] });
    if (!r.ok) throw new Error(r.code);
    const id = (await getExam(userId, r.examId))!.sections[0].branches[0].id;
    expect(await editQuestion(userId, id, { answer: "الذبول" })).toMatchObject({ ok: false, code: "ANSWER_NOT_IN_OPTIONS" });
    expect(await editQuestion(userId, id, { options: ["أ", "ب", "ج"] })).toMatchObject({ ok: false, code: "ANSWER_NOT_IN_OPTIONS" });
    expect((await editQuestion(userId, id, { answer: "التنفس" })).ok).toBe(true);
  });

  it("a quota error fails the exam honestly (no fake questions)", async () => {
    reply = new AiError("QUOTA", "limit: 20 per day");
    const r = await createExam(userId, { curriculumId: curId, pageFrom: 1, pageTo: 5, kind: "QUIZ", difficulty: "EASY", sections: [{ type: "DEFINE", count: 1, marksEach: 1 }] });
    expect(r).toMatchObject({ ok: false, code: "AI_QUOTA" });
    expect((await db.exam.findUniqueOrThrow({ where: { id: (r as { examId: string }).examId } })).status).toBe("FAILED");
  });

  it("refuses question types the subject does not allow, and pages outside the book", async () => {
    expect(await createExam(userId, { curriculumId: curId, pageFrom: 1, pageTo: 5, kind: "QUIZ", difficulty: "EASY", sections: [{ type: "GRAMMAR_PARSING", count: 1, marksEach: 1 }] })).toMatchObject({ ok: false, code: "TYPE_NOT_ALLOWED" });
    expect(await createExam(userId, { curriculumId: curId, pageFrom: 15, pageTo: 99, kind: "QUIZ", difficulty: "EASY", sections: [{ type: "DEFINE", count: 1, marksEach: 1 }] })).toMatchObject({ ok: false, code: "PAGE_OUT_OF_RANGE" });
  });

  it("edit, regenerate, undo and delete a question — each recorded as a revision, marks recomputed", async () => {
    reply = { questions: [q(0, "عرّف الضوء", { answer: "طاقة" }), q(0, "عرّف الماء", { answer: "سائل", sourcePages: [11] })] };
    const r = await createExam(userId, { curriculumId: curId, pageFrom: 10, pageTo: 12, kind: "QUIZ", difficulty: "EASY", sections: [{ type: "DEFINE", count: 2, marksEach: 3 }] });
    if (!r.ok) throw new Error(r.code);
    const [a, b] = (await getExam(userId, r.examId))!.sections[0].branches;

    expect(await editQuestion(otherId, a.id, { prompt: "x" })).toMatchObject({ ok: false, code: "NOT_FOUND" }); // ليس صاحبه
    expect((await editQuestion(userId, a.id, { prompt: "عرّف الضوء تعريفاً دقيقاً", marks: 5 })).ok).toBe(true);
    let e = (await getExam(userId, r.examId))!;
    expect(e.totalMarks).toBe(8);
    expect(e.sections[0].marks).toBe(8);

    // إعادة التوليد ترسل أسئلة القسم الحالية لتجنّب التكرار
    reply = { questions: [q(0, "عرّف الكلوروفيل", { answer: "صبغة خضراء" })] };
    expect((await regenerateQuestion(userId, b.id)).ok).toBe(true);
    expect(calls.at(-1)!.prompt).toContain("Do NOT repeat these existing questions");
    expect(calls.at(-1)!.prompt).toContain("  - الماء"); // فعل التعليمة لا يُخزَّن في الفرع
    e = (await getExam(userId, r.examId))!;
    expect(e.sections[0].branches[1].prompt).toBe("الكلوروفيل");

    expect((await undoQuestion(userId, b.id)).ok).toBe(true);
    e = (await getExam(userId, r.examId))!;
    expect(e.sections[0].branches[1].prompt).toBe("الماء");
    expect(await db.examQuestionRevision.count({ where: { questionId: b.id } })).toBe(3); // CREATE, REGENERATE, RESTORE

    expect((await deleteQuestion(userId, b.id)).ok).toBe(true);
    e = (await getExam(userId, r.examId))!;
    expect(e.sections[0].branches).toHaveLength(1);
    expect(e.totalMarks).toBe(5);
  });

  it("whole-exam editing: honorifics, total marks distribution, sections and items edited, added, reordered, deleted", async () => {
    reply = { questions: [
      q(0, "عرّف الضوء", { answer: "طاقة يحتاجها النبات كما قال النبي (ص)" }),
      q(0, "عرّف الماء", { answer: "سائل", sourcePages: [11] }),
      q(1, "علّل: يحتاج النبات للضوء", { answer: "للبناء الضوئي", difficulty: "HARD" }),
    ] };
    const r = await createExam(userId, { curriculumId: curId, pageFrom: 10, pageTo: 12, kind: "MONTHLY", difficulty: "MIXED", totalMarks: 20, distribution: "smart", sections: [{ type: "DEFINE", count: 2, marksEach: 1 }, { type: "JUSTIFY", count: 1, marksEach: 1 }] });
    if (!r.ok) throw new Error(r.code);
    let e = (await getExam(userId, r.examId))!;
    expect(e.totalMarks).toBe(20);
    expect(e.sections.reduce((n, s) => n + s.marks, 0)).toBe(20);
    expect(e.sections[0].branches[0].prompt).toBe("الضوء"); // بلا «عرّف» في كل فرع
    expect(e.sections[0].branches[0].answer).toContain("(صلى\u00A0الله\u00A0عليه\u00A0وآله\u00A0وسلم)");

    const [def, just] = e.sections;
    expect((await updateSection(userId, def.id, { instruction: "عرّف المصطلحات الآتية:", marks: 9 })).ok).toBe(true);
    e = (await getExam(userId, r.examId))!;
    expect(e.sections[0].instruction).toBe("عرّف المصطلحات الآتية:");
    expect(e.sections[0].branches.map((b) => b.marks)).toEqual([4.5, 4.5]);
    expect(e.totalMarks).toBe(9 + just.marks);

    expect(await addManualQuestion(userId, def.id, { prompt: "عرّف التربة", answer: "الطبقة السطحية", marks: 3 })).toMatchObject({ ok: true });
    e = (await getExam(userId, r.examId))!;
    const items = e.sections[0].branches;
    expect(items.map((b) => b.prompt)).toEqual(["الضوء", "الماء", "التربة"]);
    expect((await reorderQuestions(userId, def.id, [items[2].id, items[0].id, items[1].id])).ok).toBe(true);
    expect(await reorderQuestions(userId, def.id, [items[0].id])).toMatchObject({ ok: false, code: "BAD_ORDER" });
    expect((await reorderSections(userId, r.examId, [just.id, def.id])).ok).toBe(true);
    e = (await getExam(userId, r.examId))!;
    expect(e.sections[0].type).toBe("JUSTIFY");
    expect(e.sections[1].branches[0].prompt).toBe("التربة");

    // قسم جديد يُولَّد من المصدر نفسه، ثم فرع إضافي فيه
    reply = { questions: [q(0, "عدّد ثلاثاً من حاجات النبات", { answer: "الضوء والماء والهواء" })] };
    expect(await addSection(userId, r.examId, { type: "LIST", count: 1, marksEach: 2 })).toMatchObject({ ok: true, made: 1 });
    expect(await addSection(userId, r.examId, { type: "LIST", count: 1, marksEach: 2 })).toMatchObject({ ok: false, code: "DUPLICATE_SECTION" });
    reply = { questions: [q(0, "عدّد مصدرين للماء", { answer: "المطر والأنهار" })] };
    const list = (await getExam(userId, r.examId))!.sections.find((s) => s.type === "LIST")!;
    expect(await generateMore(userId, list.id, 1)).toMatchObject({ ok: true, made: 1 });
    expect(calls.at(-1)!.prompt).toContain("ثلاثاً من حاجات النبات"); // لا يكرر الموجود

    expect((await deleteSection(userId, just.id)).ok).toBe(true);
    expect((await updateExamMeta(userId, r.examId, { title: "امتحان العلوم الشهري", durationMinutes: 45 })).ok).toBe(true);
    expect((await distributeExamMarks(userId, r.examId, 30, "equal")).ok).toBe(true);
    e = (await getExam(userId, r.examId))!;
    expect(e.title).toBe("امتحان العلوم الشهري");
    expect(e.durationMinutes).toBe(45);
    expect(e.sections.map((s) => s.type)).toEqual(["DEFINE", "LIST"]);
    expect(e.sections.map((s) => s.marks)).toEqual([15, 15]);
    expect(e.totalMarks).toBe(30);
    expect(await updateSection(otherId, def.id, { marks: 1 })).toMatchObject({ ok: false, code: "NOT_FOUND" }); // ليس صاحبه
  });

  it("optional questions: the student may leave a question or some branches; totals count only what is answered", async () => {
    const types = ["DEFINE", "JUSTIFY", "LIST", "COMPARE", "WHAT_IF", "FILL_BLANK"] as const;
    reply = { questions: types.flatMap((t, i) => [q(i, `سؤال ${t} الأول`, { answer: "أ" }), q(i, `سؤال ${t} الثاني`, { answer: "ب", sourcePages: [11] }), q(i, `سؤال ${t} الثالث`, { answer: "ج", sourcePages: [12] })]) };
    const r = await createExam(userId, { curriculumId: curId, pageFrom: 10, pageTo: 12, kind: "MIDTERM", difficulty: "MIXED", totalMarks: 120, distribution: "equal", sections: types.map((t) => ({ type: t, count: 3, marksEach: 2 })) });
    if (!r.ok) throw new Error(r.code);
    let e = (await getExam(userId, r.examId))!;
    expect(e.sections).toHaveLength(6);
    expect(e.totalMarks).toBe(120);
    expect(e.firstRequired).toBe(true);
    expect(e.sectionsToAnswer).toBeNull();

    // يجب أن يبقى سؤال يُترك وسؤال يُجاب عنه على الأقل
    expect(await updateExamMeta(userId, r.examId, { sectionsToAnswer: 6 })).toMatchObject({ ok: false, code: "BAD_COUNT" });
    expect(await updateExamMeta(userId, r.examId, { sectionsToAnswer: 0 })).toMatchObject({ ok: false, code: "BAD_COUNT" });
    // ٦ أسئلة يجيب عن ٥ والأول إجباري: الدرجة الكلية = ٥ أقسام
    expect((await updateExamMeta(userId, r.examId, { sectionsToAnswer: 5, firstRequired: true })).ok).toBe(true);
    e = (await getExam(userId, r.examId))!;
    expect(e.sectionsToAnswer).toBe(5);
    expect(e.totalMarks).toBe(100);
    // التوزيع يعطي الأقسام درجات متساوية ومجموع المُجاب عنه = المطلوب
    expect((await distributeExamMarks(userId, r.examId, 100, "smart")).ok).toBe(true);
    e = (await getExam(userId, r.examId))!;
    expect(e.sections.map((s) => s.marks)).toEqual([20, 20, 20, 20, 20, 20]);
    expect(e.totalMarks).toBe(100);

    // فروع اختيارية داخل قسم: يجيب عن فرعين من ثلاثة
    const first = e.sections[0];
    expect(await updateSection(userId, first.id, { answerCount: 3 })).toMatchObject({ ok: false, code: "BAD_COUNT" }); // = العدد كله
    expect(await updateSection(userId, first.id, { answerCount: 2 })).toMatchObject({ ok: true });
    e = (await getExam(userId, r.examId))!;
    expect(e.sections[0].answerCount).toBe(2);
    expect(e.sections[0].branches.map((b) => b.marks)).toEqual([10, 10, 10]);
    expect(e.sections[0].marks).toBe(20); // أعلى ما يُحصَّل من فرعين
    expect(e.totalMarks).toBe(100);
    expect(await updateSection(otherId, first.id, { answerCount: 1 })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await updateExamMeta(otherId, r.examId, { sectionsToAnswer: 2 })).toMatchObject({ ok: false, code: "NOT_FOUND" });

    // حذف فرع حتى لا يبقى ما يُترك: العدد يُصحَّح إلى «الكل»
    await deleteQuestion(userId, first.branches[2].id);
    e = (await getExam(userId, r.examId))!;
    expect(e.sections[0].branches).toHaveLength(2);
    expect(e.sections[0].answerCount).toBeNull();
    // حذف أقسام حتى يتساوى العدد مع المطلوب: الامتحان يعود «الكل»
    for (const s of e.sections.slice(4)) await deleteSection(userId, s.id);
    e = (await getExam(userId, r.examId))!;
    expect(e.sections).toHaveLength(4);
    expect(e.sectionsToAnswer).toBeNull();
    expect(e.totalMarks).toBe(e.sections.reduce((n, s) => n + s.marks, 0));
  });

  it("duplicating a question or a whole section inserts the copy right after it and keeps totals right", async () => {
    reply = { questions: [q(0, "عرّف الضوء الأول", { answer: "أ" }), q(0, "عرّف الماء الثاني", { answer: "ب", sourcePages: [11] }), q(1, "علّل الظاهرة الأولى", { answer: "ج" })] };
    const r = await createExam(userId, { curriculumId: curId, pageFrom: 10, pageTo: 12, kind: "QUIZ", difficulty: "MIXED", sections: [{ type: "DEFINE", count: 2, marksEach: 3 }, { type: "JUSTIFY", count: 1, marksEach: 4 }] });
    if (!r.ok) throw new Error(r.code);
    let e = (await getExam(userId, r.examId))!;
    expect(e.totalMarks).toBe(10);
    const first = e.sections[0].branches[0];
    const copy = await duplicateQuestion(userId, first.id);
    expect(copy.ok).toBe(true);
    e = (await getExam(userId, r.examId))!;
    expect(e.sections[0].branches.map((b) => b.prompt)).toEqual([first.prompt, first.prompt, "الماء الثاني"]); // النسخة بعد الأصل مباشرة
    expect(e.sections[0].branches.map((b) => b.marks)).toEqual([3, 3, 3]);
    expect(e.totalMarks).toBe(13);
    expect(await duplicateQuestion(otherId, first.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });

    expect(await duplicateSection(otherId, e.sections[0].id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect((await duplicateSection(userId, e.sections[0].id)).ok).toBe(true);
    e = (await getExam(userId, r.examId))!;
    expect(e.sections.map((s) => s.type)).toEqual(["DEFINE", "DEFINE", "JUSTIFY"]);
    expect(e.sections[1].branches).toHaveLength(3);
    expect(e.sections[1].marks).toBe(9);
    expect(e.totalMarks).toBe(22);
    expect(e.sections.map((s) => s.sortOrder)).toEqual([1, 2, 3]);
  });

  it("previous exam structures: types, current item counts, totals, owner only", async () => {
    reply = { questions: [q(0, "عرّف الضوء الأول", { answer: "أ" }), q(0, "عرّف الماء الثاني", { answer: "ب", sourcePages: [11] }), q(1, "علّل الظاهرة", { answer: "ج" })] };
    const r = await createExam(userId, { curriculumId: curId, pageFrom: 10, pageTo: 12, kind: "MIDTERM", difficulty: "HARD", durationMinutes: 50, totalMarks: 40, distribution: "smart", sections: [{ type: "DEFINE", count: 2, marksEach: 1 }, { type: "JUSTIFY", count: 1, marksEach: 1 }] });
    if (!r.ok) throw new Error(r.code);
    const mine = (await listStructures(userId)).find((x) => x.id === r.examId)!;
    expect(mine).toMatchObject({ curriculumId: curId, kind: "MIDTERM", difficulty: "HARD", durationMinutes: 50, totalMarks: 40, sections: [{ type: "DEFINE", count: 2 }, { type: "JUSTIFY", count: 1 }] });
    // بعد إضافة فرع يدوياً يُحسب العدد الحالي
    const e = (await getExam(userId, r.examId))!;
    await addManualQuestion(userId, e.sections[1].id, { prompt: "علّل آخر", answer: "د", marks: 2 });
    expect((await listStructures(userId)).find((x) => x.id === r.examId)!.sections[1].count).toBe(2);
    expect((await listStructures(otherId)).find((x) => x.id === r.examId)).toBeUndefined();
  });

  it("with a teacher's reference paper, the section instruction takes the teacher's wording and the paper is sent as style only", async () => {
    const sci = await db.subject.findUniqueOrThrow({ where: { code: "SCIENCE" } });
    const g = await db.grade.findUniqueOrThrow({ where: { code: "PRI_5" } });
    const sample = await db.examSample.create({ data: { subjectId: sci.id, gradeId: g.id, title: "ورقة مدرس", text: "س١/ عرّف المصطلحات العلمية الآتية: (١٠ درجات)\n١- الخلية ٢- النسيج" } });
    try {
      reply = { questions: [q(0, "البناء الضوئي", { answer: "عملية…" })], sectionInstructions: [{ section: 0, instruction: "س١/ عرّف المصطلحات العلمية الآتية:" }] };
      const r = await createExam(userId, { curriculumId: curId, pageFrom: 10, pageTo: 12, kind: "QUIZ", difficulty: "EASY", sections: [{ type: "DEFINE", count: 1, marksEach: 2 }] });
      if (!r.ok) throw new Error(r.code);
      expect(calls.at(-1)!.prompt).toContain("reference paper 1");
      expect(calls.at(-1)!.prompt).toContain("عرّف المصطلحات العلمية الآتية");
      expect((await getExam(userId, r.examId))!.sections[0].instruction).toBe("عرّف المصطلحات العلمية الآتية:");
    } finally {
      await db.examSample.delete({ where: { id: sample.id } });
    }
  });
});


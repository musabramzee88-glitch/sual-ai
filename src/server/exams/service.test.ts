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
const { createExam, getExam, editQuestion, regenerateQuestion, undoQuestion, deleteQuestion, examOptions } = await import("./service");
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
    expect(calls.at(-1)!.prompt).toContain("عرّف الماء");
    e = (await getExam(userId, r.examId))!;
    expect(e.sections[0].branches[1].prompt).toBe("عرّف الكلوروفيل");

    expect((await undoQuestion(userId, b.id)).ok).toBe(true);
    e = (await getExam(userId, r.examId))!;
    expect(e.sections[0].branches[1].prompt).toBe("عرّف الماء");
    expect(await db.examQuestionRevision.count({ where: { questionId: b.id } })).toBe(3); // CREATE, REGENERATE, RESTORE

    expect((await deleteQuestion(userId, b.id)).ok).toBe(true);
    e = (await getExam(userId, r.examId))!;
    expect(e.sections[0].branches).toHaveLength(1);
    expect(e.totalMarks).toBe(5);
  });
});

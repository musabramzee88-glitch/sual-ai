import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// النموذج مُحاكى: يعيد ما نحدده ويسجّل ما أُرسل إليه
const calls: string[] = [];
let reply: unknown = null;
vi.mock("../ai/gemini", async (orig) => {
  const real = await orig<typeof import("../ai/gemini")>();
  return { ...real, currentModel: () => "mock-model", geminiJson: vi.fn(async (o: { prompt: string }) => { calls.push(o.prompt); return reply; }) };
});

const { db } = await import("../db");
const { createExam, getExam, generateMore, updateSection, duplicateSection, regenerateQuestion } = await import("./service");

const TAG = `up${Date.now()}`;
const YEAR = "2093-2094";
let userId = "", otherId = "", curId = "", bookId = "", prevCurrent: string | null = null;
const PASSAGE = "Ali lives in a small village near a river. Every morning he walks to school with his sister Sara, and they talk about their lessons. After school he helps his father on the farm, where they grow tomatoes and cucumbers.\n\nOn Fridays the family visits the market in the nearby town. Ali likes to buy fresh bread and sweets for his little brother. In the evening they all sit together, eat dinner, and listen to his grandfather's old stories about the village.";
const qs = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ section: 0, prompt: `Question ${from + i + 1} about Ali?`, answer: `Answer ${from + i + 1}.`, sourcePages: [] as number[] }));

beforeAll(async () => {
  prevCurrent = (await db.academicYear.findFirst({ where: { isCurrent: true } }))?.id ?? null;
  await db.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
  const year = await db.academicYear.create({ data: { label: YEAR, startsOn: new Date("2093-09-01"), endsOn: new Date("2094-06-30"), isCurrent: true } });
  const [track, grade, subject] = await Promise.all([
    db.curriculumTrack.findUniqueOrThrow({ where: { code: "GENERAL" } }),
    db.grade.findUniqueOrThrow({ where: { code: "PRI_6" } }),
    db.subject.findFirstOrThrow({ where: { family: "ENGLISH" } }),
  ]);
  const cur = await db.curriculum.create({ data: { trackId: track.id, gradeId: grade.id, subjectId: subject.id, academicYearId: year.id, language: "EN", title: "English test" } });
  curId = cur.id;
  const book = await db.uploadedBook.create({ data: { ownerId: null, curriculumId: cur.id, originalName: "e.pdf", storageKey: `books/${TAG}.pdf`, mimeType: "application/pdf", sizeBytes: 1, sha256: TAG, status: "READY", pageCount: 20 } });
  bookId = book.id;
  await db.bookPage.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ bookId, pageNumber: i + 1, text: `Page ${i + 1}: My family and my village. Farmers grow vegetables and children go to school every day.`, isOcr: false })) });
  userId = (await db.user.create({ data: { fullName: "Teacher", email: `${TAG}@example.test`, phone: `+96477${String(Date.now()).slice(-8)}`, passwordHash: "x" } })).id;
  otherId = (await db.user.create({ data: { fullName: "Other", email: `${TAG}b@example.test`, phone: `+96476${String(Date.now()).slice(-8)}`, passwordHash: "x" } })).id;
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

const input = { curriculumId: "", pageFrom: 1, pageTo: 5, kind: "MONTHLY" as const, difficulty: "MIXED" as const, sections: [{ type: "UNSEEN_PASSAGE" as const, count: 3, marksEach: 2 }] };
const make = () => createExam(userId, { ...input, curriculumId: curId });

describe("unseen passage through the service", () => {
  it("stores the new passage on the main question, with questions that need no source page", async () => {
    reply = { questions: qs(3), passages: [{ section: 0, text: PASSAGE }] };
    const r = await make();
    expect(r).toMatchObject({ ok: true, made: 3 });
    const e = (await getExam(userId, (r as { examId: string }).examId))!;
    expect(e.status).toBe("READY");
    expect(e.sections).toHaveLength(1);
    expect(e.sections[0]).toMatchObject({ type: "UNSEEN_PASSAGE", passage: PASSAGE });
    expect(e.sections[0].branches).toHaveLength(3);
  });

  it("a missing or unusable passage fails clearly and creates no section", async () => {
    for (const bad of [{ questions: qs(3) }, { questions: qs(3), passages: [{ section: 0, text: "Too short." }] }, { questions: qs(3), passages: [{ section: 0, text: "هذه قطعة عربية ".repeat(40) }] }]) {
      reply = bad;
      const r = (await make()) as { ok: boolean; code?: string; examId?: string };
      expect(r.ok).toBe(false);
      expect((await db.exam.findUnique({ where: { id: r.examId! } }))?.status).toBe("FAILED");
      expect(await db.examQuestion.count({ where: { examModel: { examId: r.examId! } } })).toBe(0);
    }
  });

  it("more questions and a replacement question are written about the SAME passage, never a new one", async () => {
    reply = { questions: qs(3), passages: [{ section: 0, text: PASSAGE }] };
    const r = (await make()) as { examId: string };
    const sec = (await getExam(userId, r.examId))!.sections[0];
    calls.length = 0;
    reply = { questions: qs(2, 10), passages: [{ section: 0, text: "Another passage that must be ignored ".repeat(12) }] };
    expect(await generateMore(userId, sec.id, 2)).toMatchObject({ ok: true, made: 2 });
    expect(calls[0]).toContain("ALREADY PRINTED");
    expect(calls[0]).toContain("Ali lives in a small village");
    reply = { questions: qs(1, 20) };
    expect(await regenerateQuestion(userId, sec.branches[0].id)).toMatchObject({ ok: true });
    expect(calls[1]).toContain("ALREADY PRINTED");
    const after = (await getExam(userId, r.examId))!.sections[0];
    expect(after.passage).toBe(PASSAGE);
    expect(after.branches).toHaveLength(5);
  });

  it("the teacher can edit the passage; copies keep it; other teachers and other types are refused", async () => {
    reply = { questions: qs(3), passages: [{ section: 0, text: PASSAGE }] };
    const r = (await make()) as { examId: string };
    const sec = (await getExam(userId, r.examId))!.sections[0];
    expect(await updateSection(otherId, sec.id, { passage: "x".repeat(60) })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const mine = "My own edited passage about the village and the river. ".repeat(6);
    expect(await updateSection(userId, sec.id, { passage: mine })).toEqual({ ok: true });
    expect(await duplicateSection(userId, sec.id)).toMatchObject({ ok: true });
    const e = (await getExam(userId, r.examId))!;
    expect(e.sections.map((s) => s.passage)).toEqual([mine.trim(), mine.trim()]);
    // نوع آخر لا يقبل نص قطعة
    const other = await db.examQuestion.create({ data: { examModelId: sec.examModelId, sortOrder: 9, type: "DEFINE", prompt: "Define:", instruction: "Define:", marks: 1, sourcePages: [] } });
    expect(await updateSection(userId, other.id, { passage: mine })).toMatchObject({ ok: false, code: "NOT_A_PASSAGE" });
  });
});

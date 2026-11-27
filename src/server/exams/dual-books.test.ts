import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let reply: unknown = null;
vi.mock("../ai/gemini", async (orig) => {
  const real = await orig<typeof import("../ai/gemini")>();
  return { ...real, currentModel: () => "mock-model", geminiJson: vi.fn(async (o: { prompt: string }) => { calls.push(o.prompt); return reply; }) };
});

const { db } = await import("../db");
const { createExam, getExam } = await import("./service");

const TAG = `db${Date.now()}`;
const YEAR = "2095-2096";
let userId = "", prevCurrent: string | null = null;
const ids = { sb: "", ab: "", sbBook: "", abBook: "" };

beforeAll(async () => {
  prevCurrent = (await db.academicYear.findFirst({ where: { isCurrent: true } }))?.id ?? null;
  await db.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
  const year = await db.academicYear.create({ data: { label: YEAR, startsOn: new Date("2095-09-01"), endsOn: new Date("2096-06-30"), isCurrent: true } });
  const [track, grade, subject] = await Promise.all([
    db.curriculumTrack.findUniqueOrThrow({ where: { code: "GENERAL" } }),
    db.grade.findUniqueOrThrow({ where: { code: "PRI_6" } }),
    db.subject.findFirstOrThrow({ where: { family: "ENGLISH" } }),
  ]);
  const base = { trackId: track.id, gradeId: grade.id, subjectId: subject.id, academicYearId: year.id, language: "EN" as const };
  const mk = async (kind: "TEXTBOOK" | "ACTIVITY", pages: number, marker: string) => {
    const cur = await db.curriculum.create({ data: { ...base, kind, title: `${marker} book` } });
    const book = await db.uploadedBook.create({ data: { ownerId: null, curriculumId: cur.id, originalName: `${marker}.pdf`, storageKey: `books/${TAG}${marker}.pdf`, mimeType: "application/pdf", sizeBytes: 1, sha256: TAG + marker, status: "READY", pageCount: pages } });
    await db.bookPage.createMany({ data: Array.from({ length: pages }, (_, i) => ({ bookId: book.id, pageNumber: i + 1, text: `${marker} page ${i + 1}: Unit lesson about family, school and the village for pupils. Children read short texts, answer questions, and practise new words every day.`, isOcr: false })) });
    return { cur, book };
  };
  const sb = await mk("TEXTBOOK", 20, "STUDENT");
  const ab = await mk("ACTIVITY", 20, "ACTIVITYBK");
  ids.sb = sb.cur.id; ids.ab = ab.cur.id; ids.sbBook = sb.book.id; ids.abBook = ab.book.id;
  userId = (await db.user.create({ data: { fullName: "T", email: `${TAG}@example.test`, phone: `+96477${String(Date.now()).slice(-8)}`, passwordHash: "x" } })).id;
});

afterAll(async () => {
  await db.exam.deleteMany({ where: { ownerId: userId } });
  await db.uploadedBook.deleteMany({ where: { id: { in: [ids.sbBook, ids.abBook] } } });
  await db.curriculum.deleteMany({ where: { id: { in: [ids.sb, ids.ab] } } });
  await db.academicYear.deleteMany({ where: { label: YEAR } });
  if (prevCurrent) await db.academicYear.update({ where: { id: prevCurrent }, data: { isCurrent: true } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe("English exams draw from both the Student's Book and the Activity Book", () => {
  it("sends pages of both books, and accepts questions sourced from the activity book", async () => {
    calls.length = 0;
    reply = { questions: [
      { section: 0, prompt: "Family is a group of ___ people.", answer: "A group of related people.", sourcePages: [3] },
      { section: 0, prompt: "School is a place to ___.", answer: "A place to learn.", sourcePages: [1003] },
    ] };
    const r = await createExam(userId, { curriculumId: ids.sb, pageFrom: 1, pageTo: 10, kind: "MONTHLY", difficulty: "MIXED", sections: [{ type: "FILL_BLANK", count: 2, marksEach: 5 }] });
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true, made: 2 });
    expect(calls[0]).toContain("STUDENT page 3");
    expect(calls[0]).toContain("ACTIVITYBK page 3");
    expect(calls[0]).toContain("كتاب النشاط");
    const e = (await getExam(userId, (r as { examId: string }).examId))!;
    expect(e.sections[0].branches.flatMap((b) => b.sourcePages).sort((a, b) => a - b)).toEqual([3, 1003]);
    expect(await db.examSource.count({ where: { examId: e.id, bookId: ids.abBook } })).toBeGreaterThan(0);
  });

  it("a non-English or activity-only curriculum is unchanged (no extra book)", async () => {
    const r = await createExam(userId, { curriculumId: ids.ab, pageFrom: 1, pageTo: 5, kind: "MONTHLY", difficulty: "MIXED", sections: [{ type: "FILL_BLANK", count: 1, marksEach: 5 }] });
    calls.length = 0;
    reply = { questions: [{ section: 0, prompt: "Family is a group of ___ people.", answer: "People.", sourcePages: [2] }] };
    const r2 = await createExam(userId, { curriculumId: ids.ab, pageFrom: 1, pageTo: 5, kind: "MONTHLY", difficulty: "MIXED", sections: [{ type: "FILL_BLANK", count: 1, marksEach: 5 }] });
    expect(r2).toMatchObject({ ok: true });
    expect(calls[0]).not.toContain("STUDENT page");
    void r;
  });
});

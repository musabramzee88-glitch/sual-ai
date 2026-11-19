import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { applyLinks } from "./bulk";
import { createEntity } from "../admin/curriculum";

const TAG = `bl${Date.now()}`;
let actor = { adminId: "", ip: "1.1.1.1" };
let prevCurrent: string | null = null;
const bookIds: string[] = [];
const YEAR = "2088-2089";

const mkBook = async (name: string) => {
  const b = await db.uploadedBook.create({ data: { ownerId: null, originalName: name, storageKey: `books/${TAG}-${bookIds.length}.pdf`, mimeType: "application/pdf", sizeBytes: 1, sha256: `${TAG}${bookIds.length}` } });
  bookIds.push(b.id);
  return b.id;
};

beforeAll(async () => {
  const u = await db.user.create({ data: { fullName: "مدير ربط", email: `${TAG}@example.test`, phone: `+96478${String(Date.now()).slice(-8)}`, passwordHash: "x", role: "SUPER_ADMIN" } });
  actor = { adminId: (await db.adminUser.create({ data: { userId: u.id, permissions: [] } })).id, ip: "1.1.1.1" };
  prevCurrent = (await db.academicYear.findFirst({ where: { isCurrent: true } }))?.id ?? null;
});
afterAll(async () => {
  await db.uploadedBook.deleteMany({ where: { id: { in: bookIds } } });
  await db.curriculum.deleteMany({ where: { academicYear: { label: YEAR } } });
  await db.academicYear.deleteMany({ where: { label: YEAR } });
  if (prevCurrent) await db.academicYear.update({ where: { id: prevCurrent }, data: { isCurrent: true } });
  await db.adminAuditLog.deleteMany({ where: { adminUserId: actor.adminId } });
  await db.user.deleteMany({ where: { email: `${TAG}@example.test` } });
  await db.$disconnect();
});

describe("bulk link books to curricula", () => {
  it("refuses without a current academic year", async () => {
    await db.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    const b = await mkBook("كتاب-الرياضيات-الاول-الابتدائي-x.pdf");
    expect(await applyLinks(actor, { trackCode: "GENERAL", items: [{ bookId: b, gradeCode: "PRI_1", subjectCode: "MATH", kind: "TEXTBOOK" }] })).toEqual({ ok: false, code: "NO_CURRENT_YEAR" });
  });

  it("two books of the same subject/grade become two curricula (textbook + exercises); same kind is reused", async () => {
    const y = await createEntity(actor, "years", { label: YEAR, startsOn: "2088-09-01", endsOn: "2089-06-30" });
    if (!y.ok) throw new Error(y.code);
    await db.academicYear.update({ where: { id: y.id }, data: { isCurrent: true } });

    const text = await mkBook("كتاب-الرياضيات-الاول-الابتدائي-a.pdf");
    const ex = await mkBook("كتاب-تمرينات-الرياضيات-الاول-الابتدائي-b.pdf");
    const act = await mkBook("نشاط-القراءة-الاول-الابتدائي-c.pdf");
    const text2 = await mkBook("كتاب-الرياضيات-الاول-الابتدائي-d.pdf");
    const r = await applyLinks(actor, { trackCode: "GENERAL", items: [
      { bookId: text, gradeCode: "PRI_1", subjectCode: "MATH", kind: "TEXTBOOK" },
      { bookId: ex, gradeCode: "PRI_1", subjectCode: "MATH", kind: "EXERCISES" },
      { bookId: act, gradeCode: "PRI_1", subjectCode: "READING", kind: "ACTIVITY" },
      { bookId: text2, gradeCode: "PRI_1", subjectCode: "MATH", kind: "TEXTBOOK" },
    ] });
    if (!r.ok) throw new Error(r.code);
    expect(r.results.map((x) => [x.ok, x.created])).toEqual([[true, true], [true, true], [true, true], [true, false]]);

    const cs = await db.curriculum.findMany({ where: { academicYear: { label: YEAR } }, orderBy: { title: "asc" } });
    expect(cs.map((c) => [c.title, c.kind, c.language])).toEqual(expect.arrayContaining([
      ["الرياضيات — الأول الابتدائي", "TEXTBOOK", "AR"],
      ["تمارين الرياضيات — الأول الابتدائي", "EXERCISES", "AR"],
      ["نشاط القراءة — الأول الابتدائي", "ACTIVITY", "AR"],
    ]));
    expect(cs).toHaveLength(3);
    const linked = await db.uploadedBook.findMany({ where: { id: { in: [text, text2] } } });
    expect(new Set(linked.map((b) => b.curriculumId)).size).toBe(1); // الكتابان من النوع نفسه → منهج واحد
    expect((await db.uploadedBook.findUniqueOrThrow({ where: { id: ex } })).curriculumId).not.toBe(linked[0].curriculumId);
  });

  it("English books are English-language curricula; invalid combos fail per item without blocking the rest", async () => {
    const en = await mkBook("كتاب الانكليزي الطالب الصف الرابع الابتدائي.pdf");
    const bad = await mkBook("x-gifted.pdf");
    const r = await applyLinks(actor, { trackCode: "GIFTED", items: [
      { bookId: en, gradeCode: "INT_1", subjectCode: "ENGLISH", kind: "TEXTBOOK" },
      { bookId: bad, gradeCode: "PRI_1", subjectCode: "MATH", kind: "TEXTBOOK" }, // «المتميزين» غير متاح للابتدائي
      { bookId: "notarealbookid000", gradeCode: "INT_1", subjectCode: "MATH", kind: "TEXTBOOK" },
    ] });
    if (!r.ok) throw new Error(r.code);
    expect(r.results.map((x) => x.ok ? "ok" : x.code)).toEqual(["ok", "TRACK_NOT_FOR_GRADE", "REFERENCE_NOT_FOUND"]);
    expect((await db.curriculum.findFirstOrThrow({ where: { subject: { code: "ENGLISH" }, academicYear: { label: YEAR } } })).language).toBe("EN");
  });

  it("curricula identity now includes the book kind at the database level", async () => {
    const c = await db.curriculum.findFirstOrThrow({ where: { kind: "TEXTBOOK", academicYear: { label: YEAR }, subject: { code: "MATH" } } });
    await expect(db.curriculum.create({ data: { trackId: c.trackId, gradeId: c.gradeId, subjectId: c.subjectId, academicYearId: c.academicYearId, language: c.language, kind: "TEXTBOOK", title: "dup" } })).rejects.toThrow();
    await expect(db.curriculum.create({ data: { trackId: c.trackId, gradeId: c.gradeId, subjectId: c.subjectId, academicYearId: c.academicYearId, language: c.language, kind: "EXERCISES", title: "dup2" } })).rejects.toThrow(); // موجود أصلاً (من الاختبار السابق)
  });
});

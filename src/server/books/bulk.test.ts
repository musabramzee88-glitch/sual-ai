import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { confirmPlacements, listOccupiedKeys, listReview } from "./bulk";
import { createEntity } from "../admin/curriculum";
import { placeBook } from "./placement";

const TAG = `bl${Date.now()}`;
let actor = { adminId: "", ip: "1.1.1.1" };
let prevCurrent: string | null = null;
const bookIds: string[] = [];
const YEAR = "2088-2089";

const mkBook = async (name: string) => {
  const b = await db.uploadedBook.create({ data: { ownerId: null, originalName: name, storageKey: `books/${TAG}-${bookIds.length}.pdf`, mimeType: "application/pdf", sizeBytes: 1, sha256: `${TAG}${bookIds.length}`, status: "READY", pageCount: 1, detected: { gradeCode: null, subjectCode: null, kind: "TEXTBOOK", confidence: "low", evidence: "", source: "text" } } });
  bookIds.push(b.id);
  return b.id;
};
const item = (bookId: string, gradeCode: string, subjectCode: string, kind: "TEXTBOOK" | "EXERCISES" | "ACTIVITY", trackCode = "GENERAL", part = 0) => ({ bookId, trackCode, gradeCode, subjectCode, kind, part });

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

describe("placing and confirming books", () => {
  it("refuses without a current academic year", async () => {
    await db.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    const b = await mkBook("a.pdf");
    expect(await placeBook(actor, b, { trackCode: "GENERAL", gradeCode: "PRI_1", subjectCode: "MATH", kind: "TEXTBOOK" }, "confirm")).toEqual({ ok: false, code: "NO_CURRENT_YEAR" });
  });

  it("two books of the same subject/grade become two curricula (textbook + exercises); same kind is reused; confirmed books leave the review list", async () => {
    const y = await createEntity(actor, "years", { label: YEAR, startsOn: "2088-09-01", endsOn: "2089-06-30" });
    if (!y.ok) throw new Error(y.code);
    await db.academicYear.update({ where: { id: y.id }, data: { isCurrent: true } });

    const text = await mkBook("t1.pdf"), ex = await mkBook("t2.pdf"), act = await mkBook("t3.pdf"), text2 = await mkBook("t4.pdf");
    const mine = [text, ex, act, text2];
    expect((await listReview()).filter((x) => mine.includes(x.id)).length).toBe(4); // كلها تنتظر مراجعة
    const r = await confirmPlacements(actor, { items: [
      item(text, "PRI_1", "MATH", "TEXTBOOK"), item(ex, "PRI_1", "MATH", "EXERCISES"), item(act, "PRI_1", "READING", "ACTIVITY"), item(text2, "PRI_1", "MATH", "TEXTBOOK"),
    ] });
    expect(r.map((x) => [x.ok, x.created])).toEqual([[true, true], [true, true], [true, true], [true, false]]);

    const cs = await db.curriculum.findMany({ where: { academicYear: { label: YEAR } } });
    expect(cs.map((c) => [c.title, c.kind, c.language]).sort()).toEqual([
      ["الرياضيات — الأول الابتدائي", "TEXTBOOK", "AR"], ["تمارين الرياضيات — الأول الابتدائي", "EXERCISES", "AR"], ["نشاط القراءة — الأول الابتدائي", "ACTIVITY", "AR"],
    ].sort());
    const linked = await db.uploadedBook.findMany({ where: { id: { in: [text, text2] } } });
    expect(new Set(linked.map((b) => b.curriculumId)).size).toBe(1);
    expect(linked.every((b) => b.confirmedAt !== null)).toBe(true);
    expect((await listReview()).filter((x) => mine.includes(x.id)).length).toBe(0); // لا شيء ينتظر المراجعة بعد التأكيد
  });

  it("English books are English-language curricula; invalid combos fail per item without blocking the rest", async () => {
    const en = await mkBook("e.pdf"), bad = await mkBook("g.pdf");
    const r = await confirmPlacements(actor, { items: [
      item(en, "INT_1", "ENGLISH", "TEXTBOOK", "GIFTED"),
      item(bad, "PRI_1", "MATH", "TEXTBOOK", "GIFTED"), // «المتميزين» غير متاح للابتدائي
      item("notarealbookid000", "INT_1", "MATH", "TEXTBOOK"),
    ] });
    expect(r.map((x) => (x.ok ? "ok" : x.code))).toEqual(["ok", "TRACK_NOT_FOR_GRADE", "REFERENCE_NOT_FOUND"]);
    expect((await db.curriculum.findFirstOrThrow({ where: { subject: { code: "ENGLISH" }, academicYear: { label: YEAR } } })).language).toBe("EN");
  });

  it("auto placement waits for confirmation, never overrides a user's choice; a confirm can correct it", async () => {
    const a = await mkBook("auto.pdf");
    const auto = await placeBook(actor, a, { trackCode: "GENERAL", gradeCode: "PRI_2", subjectCode: "SCIENCE", kind: "TEXTBOOK" }, "auto");
    expect(auto.ok).toBe(true);
    let row = await db.uploadedBook.findUniqueOrThrow({ where: { id: a } });
    expect(row).toMatchObject({ autoLinked: true, confirmedAt: null });
    const rev = (await listReview()).find((x) => x.id === a)!;
    expect([rev.linked, rev.gradeCode, rev.subjectCode, rev.sure]).toEqual([true, "PRI_2", "SCIENCE", true]);

    // لا يعاد الوضع التلقائي فوق ربط موجود
    expect(await placeBook(actor, a, { trackCode: "GENERAL", gradeCode: "PRI_3", subjectCode: "MATH", kind: "TEXTBOOK" }, "auto")).toEqual({ ok: false, code: "ALREADY_LINKED" });
    // تصحيح المستخدم يُعيد الوضع ويؤكّد
    const fixed = await confirmPlacements(actor, { items: [item(a, "PRI_3", "SCIENCE", "TEXTBOOK")] });
    expect(fixed[0].ok).toBe(true);
    row = await db.uploadedBook.findUniqueOrThrow({ where: { id: a }, include: { curriculum: { include: { grade: true } } } }) as never;
    expect(row.confirmedAt).not.toBeNull();
    expect((row as unknown as { curriculum: { grade: { code: string } } }).curriculum.grade.code).toBe("PRI_3");
    expect(await db.adminAuditLog.count({ where: { adminUserId: actor.adminId, action: { in: ["book.auto_link", "book.confirm"] } } })).toBeGreaterThanOrEqual(5);
  });

  it("curricula identity includes the book kind at the database level", async () => {
    const c = await db.curriculum.findFirstOrThrow({ where: { kind: "TEXTBOOK", academicYear: { label: YEAR }, subject: { code: "MATH" } } });
    await expect(db.curriculum.create({ data: { trackId: c.trackId, gradeId: c.gradeId, subjectId: c.subjectId, academicYearId: c.academicYearId, language: c.language, kind: "TEXTBOOK", title: "dup" } })).rejects.toThrow();
  });

  it("part 1 and part 2 of the same book become separate curricula (separate page numbering); occupied keys expose conflicts", async () => {
    const p1 = await mkBook("part1.pdf"), p2 = await mkBook("part2.pdf"), dup = await mkBook("part-dup.pdf");
    const r = await confirmPlacements(actor, { items: [item(p1, "PRI_3", "MATH", "TEXTBOOK", "GENERAL", 1), item(p2, "PRI_3", "MATH", "TEXTBOOK", "GENERAL", 2)] });
    expect(r.map((x) => [x.ok, x.created])).toEqual([[true, true], [true, true]]);
    const cs = await db.curriculum.findMany({ where: { academicYear: { label: YEAR }, grade: { code: "PRI_3" }, subject: { code: "MATH" } }, orderBy: { part: "asc" } });
    expect(cs.map((c) => [c.part, c.title])).toEqual([[1, "الرياضيات — الجزء الأول — الثالث الابتدائي"], [2, "الرياضيات — الجزء الثاني — الثالث الابتدائي"]]);
    expect(cs[0].id).not.toBe(cs[1].id);

    const occ = await listOccupiedKeys();
    expect(occ).toContain("GENERAL|PRI_3|MATH|TEXTBOOK|1");
    expect(occ).toContain("GENERAL|PRI_3|MATH|TEXTBOOK|2");
    expect(occ).not.toContain("GENERAL|PRI_3|MATH|TEXTBOOK|0");

    // بلا جزء: منهج ثالث مستقل (جزء 0)
    const whole = await confirmPlacements(actor, { items: [item(dup, "PRI_3", "MATH", "TEXTBOOK")] });
    expect(whole[0]).toMatchObject({ ok: true, created: true });
    expect(await db.curriculum.count({ where: { academicYear: { label: YEAR }, grade: { code: "PRI_3" }, subject: { code: "MATH" } } })).toBe(3);
    // الجزء مفروض في قاعدة البيانات أيضاً
    const c = cs[0];
    await expect(db.curriculum.create({ data: { trackId: c.trackId, gradeId: c.gradeId, subjectId: c.subjectId, academicYearId: c.academicYearId, language: c.language, kind: "TEXTBOOK", part: 1, title: "dup" } })).rejects.toThrow();
    await expect(db.curriculum.create({ data: { trackId: c.trackId, gradeId: c.gradeId, subjectId: c.subjectId, academicYearId: c.academicYearId, language: c.language, kind: "TEXTBOOK", part: 9, title: "bad" } })).rejects.toThrow(); // CHECK 0..5
  });
});

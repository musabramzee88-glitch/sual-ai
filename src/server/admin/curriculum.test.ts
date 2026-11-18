import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { createEntity, replaceChapters, updateEntity } from "./curriculum";
import { listCurricula, listGrades, listTracks } from "../curriculum";

// كل البيانات هنا ببادئة ZT_ وتُحذف في النهاية؛ والسنة الحالية تُعاد كما كانت
const P = `ZT${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
const Y1 = `20${String(Date.now()).slice(-2)}-20${String(Date.now() % 100 + 1).padStart(2, "0")}`;
let actor = { adminId: "", ip: "1.1.1.1" };
let prevCurrent: string | null = null;

beforeAll(async () => {
  const u = await db.user.create({ data: { fullName: "مدير مناهج", email: `${P.toLowerCase()}@example.test`, phone: `+96479${String(Date.now()).slice(-8)}`, passwordHash: "x", role: "SUPER_ADMIN" } });
  actor = { adminId: (await db.adminUser.create({ data: { userId: u.id, permissions: [] } })).id, ip: "1.1.1.1" };
  prevCurrent = (await db.academicYear.findFirst({ where: { isCurrent: true } }))?.id ?? null;
});
afterAll(async () => {
  await db.curriculum.deleteMany({ where: { title: { startsWith: P } } });
  await db.academicYear.deleteMany({ where: { label: { in: [Y1, "2097-2098"] } } });
  await db.curriculumTrack.deleteMany({ where: { code: { startsWith: P } } });
  await db.studyBranch.deleteMany({ where: { code: { startsWith: P } } });
  await db.grade.deleteMany({ where: { code: { startsWith: P } } });
  await db.educationStage.deleteMany({ where: { code: { startsWith: P } } });
  await db.subject.deleteMany({ where: { code: { startsWith: P } } });
  if (prevCurrent) await db.academicYear.update({ where: { id: prevCurrent }, data: { isCurrent: true } });
  await db.adminAuditLog.deleteMany({ where: { adminUserId: actor.adminId } });
  await db.user.deleteMany({ where: { email: `${P.toLowerCase()}@example.test` } });
  await db.$disconnect();
});

describe("curriculum admin", () => {
  it("creates a stage with grades; disabling a grade hides it from the public list; codes are validated", async () => {
    expect((await createEntity(actor, "stages", { code: `${P}_S`, nameAr: "مرحلة اختبار", nameEn: "Test stage" })).ok).toBe(true);
    const g1 = await createEntity(actor, "grades", { code: `${P}_G1`, stageCode: `${P}_S`, nameAr: "صف 1", nameEn: "G1", sortOrder: 1 });
    const g2 = await createEntity(actor, "grades", { code: `${P}_G2`, stageCode: `${P}_S`, nameAr: "صف 2", nameEn: "G2", sortOrder: 2 });
    expect(g1.ok && g2.ok).toBe(true);
    expect((await listGrades(`${P}_S`)).map((g) => g.code)).toEqual([`${P}_G1`, `${P}_G2`]);
    if (!g2.ok) return;
    expect((await updateEntity(actor, "grades", g2.id, { isActive: false })).ok).toBe(true);
    expect((await listGrades(`${P}_S`)).map((g) => g.code)).toEqual([`${P}_G1`]);
    await updateEntity(actor, "grades", g2.id, { isActive: true });

    expect(await createEntity(actor, "stages", { code: "bad code", nameAr: "x", nameEn: "x" })).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    expect(await createEntity(actor, "stages", { code: `${P}_S`, nameAr: "x", nameEn: "x" })).toEqual({ ok: false, code: "DUPLICATE" });
    expect(await createEntity(actor, "grades", { code: `${P}_GX`, stageCode: "NOPE", nameAr: "x", nameEn: "x" })).toEqual({ ok: false, code: "STAGE_NOT_FOUND" });
    expect(await db.adminAuditLog.count({ where: { adminUserId: actor.adminId, action: "curriculum.grades.update" } })).toBe(2);
  });

  it("track and branch grade availability is editable", async () => {
    const t = await createEntity(actor, "tracks", { code: `${P}_T`, nameAr: "مسار", nameEn: "Track", gradeCodes: [`${P}_G1`] });
    expect(t.ok).toBe(true);
    expect((await listTracks(`${P}_G1`)).some((x) => x.code === `${P}_T`)).toBe(true);
    expect((await listTracks(`${P}_G2`)).some((x) => x.code === `${P}_T`)).toBe(false);
    if (!t.ok) return;
    await updateEntity(actor, "tracks", t.id, { gradeCodes: [`${P}_G1`, `${P}_G2`] });
    expect((await listTracks(`${P}_G2`)).some((x) => x.code === `${P}_T`)).toBe(true);
    expect(await updateEntity(actor, "tracks", t.id, { gradeCodes: ["NOPE_GRADE"] })).toEqual({ ok: false, code: "GRADE_NOT_FOUND" });
    expect((await createEntity(actor, "branches", { code: `${P}_B`, nameAr: "فرع", nameEn: "Branch", gradeCodes: [`${P}_G2`] })).ok).toBe(true);
    expect((await createEntity(actor, "subjects", { code: `${P}_SUB`, nameAr: "مادة", nameEn: "Subject", family: "MATHEMATICS", questionTypes: ["MCQ", "PROBLEM"], useLatinSymbols: true })).ok).toBe(true);
  });

  it("only one academic year is current", async () => {
    const a = await createEntity(actor, "years", { label: Y1, startsOn: "2090-09-01", endsOn: "2091-06-30" });
    const b = await createEntity(actor, "years", { label: "2097-2098", startsOn: "2097-09-01", endsOn: "2098-06-30" });
    expect(await createEntity(actor, "years", { label: "2095-2096", startsOn: "2096-09-01", endsOn: "2095-06-30" })).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    if (!a.ok || !b.ok) throw new Error();
    await updateEntity(actor, "years", a.id, { isCurrent: true });
    await updateEntity(actor, "years", b.id, { isCurrent: true });
    expect((await db.academicYear.findMany({ where: { isCurrent: true } })).map((y) => y.label)).toEqual(["2097-2098"]);
  });

  it("curricula must be consistent and unique (even with no branch / edition)", async () => {
    const base = { trackCode: `${P}_T`, subjectCode: `${P}_SUB`, yearLabel: "2097-2098", language: "AR", title: `${P} رياضيات` };
    const c = await createEntity(actor, "curricula", { ...base, gradeCode: `${P}_G1` });
    expect(c.ok).toBe(true);
    expect(await createEntity(actor, "curricula", { ...base, gradeCode: `${P}_G1` })).toEqual({ ok: false, code: "DUPLICATE" });
    // الفهرس في القاعدة يمنع التكرار حتى لو تجاوز أحدٌ فحص الخدمة
    const cur = await db.curriculum.findFirstOrThrow({ where: { title: base.title } });
    await expect(db.curriculum.create({ data: { trackId: cur.trackId, gradeId: cur.gradeId, subjectId: cur.subjectId, academicYearId: cur.academicYearId, language: "AR", title: `${P} dup` } })).rejects.toThrow();

    expect(await createEntity(actor, "curricula", { ...base, gradeCode: `${P}_G1`, branchCode: `${P}_B` })).toEqual({ ok: false, code: "BRANCH_NOT_FOR_GRADE" });
    const branchScoped = await createEntity(actor, "curricula", { ...base, gradeCode: `${P}_G2`, branchCode: `${P}_B`, title: `${P} فرعي` });
    expect(branchScoped.ok).toBe(true);

    const t2 = await createEntity(actor, "tracks", { code: `${P}_T2`, nameAr: "مسار 2", nameEn: "Track 2", gradeCodes: [] });
    expect(t2.ok).toBe(true);
    expect(await createEntity(actor, "curricula", { ...base, trackCode: `${P}_T2`, gradeCode: `${P}_G1` })).toEqual({ ok: false, code: "TRACK_NOT_FOR_GRADE" });
  });

  it("chapters: add, reorder, edit and delete in one atomic replace", async () => {
    const cur = await db.curriculum.findFirstOrThrow({ where: { title: `${P} رياضيات` } });
    expect((await replaceChapters(actor, cur.id, { chapters: [{ title: "الأعداد", pageStart: 1, pageEnd: 20 }, { title: "الجبر", pageStart: 21, pageEnd: 50 }, { title: "الهندسة", pageStart: 51, pageEnd: 80 }] })).ok).toBe(true);
    let ch = await db.curriculumChapter.findMany({ where: { curriculumId: cur.id }, orderBy: { sortOrder: "asc" } });
    expect(ch.map((c) => c.title)).toEqual(["الأعداد", "الجبر", "الهندسة"]);
    // عكس الترتيب + تعديل + حذف «الجبر» + إضافة جديد
    const r = await replaceChapters(actor, cur.id, { chapters: [{ id: ch[2].id, title: "الهندسة المستوية", pageStart: 51, pageEnd: 80 }, { id: ch[0].id, title: "الأعداد", pageStart: 1, pageEnd: 20 }, { title: "الإحصاء", pageStart: 81, pageEnd: 95 }] });
    expect(r.ok).toBe(true);
    ch = await db.curriculumChapter.findMany({ where: { curriculumId: cur.id }, orderBy: { sortOrder: "asc" } });
    expect(ch.map((c) => [c.sortOrder, c.title])).toEqual([[1, "الهندسة المستوية"], [2, "الأعداد"], [3, "الإحصاء"]]);
    expect(await replaceChapters(actor, cur.id, { chapters: [{ id: "notarealchapterid0", title: "x" }] })).toEqual({ ok: false, code: "CHAPTER_NOT_FOUND" });
  });

  it("public listing: common curriculum shows for every branch; branch-scoped only for its branch; inactive hidden", async () => {
    const forG1 = await listCurricula({ gradeCode: `${P}_G1`, trackCode: `${P}_T` });
    expect(forG1.map((c) => c.title)).toEqual([`${P} رياضيات`]);
    expect(forG1[0].chapters.map((c) => c.title)).toEqual(["الهندسة المستوية", "الأعداد", "الإحصاء"]);
    expect((await listCurricula({ gradeCode: `${P}_G2`, trackCode: `${P}_T`, branchCode: `${P}_B` })).map((c) => c.title)).toEqual([`${P} فرعي`]);
    expect(await listCurricula({ gradeCode: `${P}_G2`, trackCode: `${P}_T`, branchCode: "OTHER" })).toEqual([]);

    const cur = await db.curriculum.findFirstOrThrow({ where: { title: `${P} رياضيات` } });
    await updateEntity(actor, "curricula", cur.id, { isActive: false });
    expect(await listCurricula({ gradeCode: `${P}_G1`, trackCode: `${P}_T` })).toEqual([]);
  });
});

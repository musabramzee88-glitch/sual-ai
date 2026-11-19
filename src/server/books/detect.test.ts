import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs"), os = require("node:os"), p = require("node:path");
  process.env.STORAGE_DIR = fs.mkdtempSync(p.join(os.tmpdir(), "sual-detect-"));
});

import { db } from "../db";
import { listReview } from "./bulk";
import { detectBook, processBook, uploadBook } from "./service";
import { createEntity } from "../admin/curriculum";

const fx = (f: string) => new Uint8Array(readFileSync(path.resolve(__dirname, "../../../test/fixtures", f)));
const TAG = `dt${Date.now()}`;
let actor = { adminId: "", ip: "1.1.1.1" };
const ids: string[] = [];
const YEAR = "2087-2088";
let prevCurrent: string | null = null;

beforeAll(async () => {
  const u = await db.user.create({ data: { fullName: "مدير تعرّف", email: `${TAG}@example.test`, phone: `+96478${String(Date.now()).slice(-8)}`, passwordHash: "x", role: "SUPER_ADMIN" } });
  actor = { adminId: (await db.adminUser.create({ data: { userId: u.id, permissions: [] } })).id, ip: "1.1.1.1" };
});
afterAll(async () => {
  await db.uploadedBook.deleteMany({ where: { id: { in: ids } } });
  await db.curriculum.deleteMany({ where: { academicYear: { label: YEAR } } });
  await db.academicYear.deleteMany({ where: { label: YEAR } });
  if (prevCurrent) await db.academicYear.update({ where: { id: prevCurrent }, data: { isCurrent: true } });
  await db.adminAuditLog.deleteMany({ where: { adminUserId: actor.adminId } });
  await db.user.deleteMany({ where: { email: `${TAG}@example.test` } });
  await db.$disconnect();
});

describe("identify a book from its cover (file name carries no information)", () => {
  it("text-based cover: grade, subject and kind come from the content, not the name", async () => {
    const r = await uploadBook(actor, { name: "-------ajhgsuv.pdf", bytes: fx("cover-text.pdf") });
    if (!r.ok) throw new Error(r.code);
    ids.push(r.id);
    await processBook(r.id, { ocr: false });
    const b = await db.uploadedBook.findUniqueOrThrow({ where: { id: r.id } });
    expect(b.detected).toMatchObject({ gradeCode: "PRI_1", subjectCode: "MATH", kind: "EXERCISES", confidence: "high", source: "text" });

    const p = (await listReview()).find((x) => x.id === r.id)!;
    expect([p.gradeCode, p.subjectCode, p.kind]).toEqual(["PRI_1", "MATH", "EXERCISES"]);
    expect(p.sure).toBe(true);
    expect(p.linked).toBe(false); // بلا actor لا ربط تلقائي
    expect(p.evidence).toContain("تمارين الرياضيات");
  });

  it("image-only cover: reads just the first pages with OCR (even with book OCR off) and identifies it", async () => {
    const r = await uploadBook(actor, { name: "------xclk1vy.pdf", bytes: fx("cover-scan.pdf") });
    if (!r.ok) throw new Error(r.code);
    ids.push(r.id);
    await processBook(r.id, { ocr: false }); // الكتاب نفسه لم يُقرأ بـ OCR (فاشل NEEDS_OCR) لكن الغلاف عُرف
    const b = await db.uploadedBook.findUniqueOrThrow({ where: { id: r.id } });
    expect(b).toMatchObject({ status: "FAILED", error: "NEEDS_OCR" });
    expect(b.detected).toMatchObject({ gradeCode: "PRI_1", subjectCode: "MATH", kind: "EXERCISES", source: "ocr" });
  }, 180_000);

  it("a book whose first pages carry no grade phrase is detected with low confidence (unsure, left unchecked)", async () => {
    const r = await uploadBook(actor, { name: "-----zzz.pdf", bytes: fx("text-ar.pdf") });
    if (!r.ok) throw new Error(r.code);
    ids.push(r.id);
    await processBook(r.id, { ocr: false });
    const d = await detectBook(r.id);
    expect(d?.confidence).toBe("low");
    const p = (await listReview()).find((x) => x.id === r.id)!;
    expect(p.sure).toBe(false);
  }, 180_000);

  it("with an actor and a current year, a confident cover is placed automatically (kept for review) without touching other books", async () => {
    prevCurrent = (await db.academicYear.findFirst({ where: { isCurrent: true } }))?.id ?? null;
    await db.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    const y = await createEntity(actor, "years", { label: YEAR, startsOn: "2087-09-01", endsOn: "2088-06-30" });
    if (!y.ok) throw new Error(y.code);
    await db.academicYear.update({ where: { id: y.id }, data: { isCurrent: true } });

    const bytes = new Uint8Array([...fx("cover-text.pdf"), 10, 37, 37, 97, 117, 116, 111]); // هاش مختلف
    const r = await uploadBook(actor, { name: "-------auto.pdf", bytes });
    if (!r.ok) throw new Error(r.code);
    ids.push(r.id);
    await processBook(r.id, { ocr: false, actor });
    const b = await db.uploadedBook.findUniqueOrThrow({ where: { id: r.id }, include: { curriculum: { include: { grade: true, subject: true } } } });
    expect(b).toMatchObject({ autoLinked: true, confirmedAt: null });
    expect([b.curriculum?.grade.code, b.curriculum?.subject.code, b.curriculum?.kind]).toEqual(["PRI_1", "MATH", "EXERCISES"]);
    expect((await listReview()).find((x) => x.id === r.id)).toMatchObject({ linked: true, autoLinked: true, sure: true });

    // الغلاف غير الواثق لا يُوضع تلقائياً
    const low = await uploadBook(actor, { name: "-------low.pdf", bytes: new Uint8Array([...fx("text-ar.pdf"), 10, 37, 37, 108, 111, 119]) });
    if (!low.ok) throw new Error(low.code);
    ids.push(low.id);
    await processBook(low.id, { ocr: false, actor });
    expect((await db.uploadedBook.findUniqueOrThrow({ where: { id: low.id } })).curriculumId).toBeNull();
  }, 180_000);
});

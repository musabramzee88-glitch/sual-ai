import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// مجلد تخزين مؤقت معزول (يُضبط قبل تحميل env)
const tmp = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs"), os = require("node:os"), p = require("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "sual-books-"));
  process.env.STORAGE_DIR = dir;
  return dir as string;
});

import { db } from "../db";
import { cancelProcessing, deleteBook, getBookPage, linkBook, processBook, reopenBook, STALE_MS, uploadBook } from "./service";
import { runOcrExclusive } from "./ocr";

const fx = (f: string) => new Uint8Array(readFileSync(path.resolve(__dirname, "../../../test/fixtures", f)));
const TAG = `bk${Date.now()}`;
let actor = { adminId: "", ip: "1.1.1.1" };
const ids: string[] = [];

beforeAll(async () => {
  const u = await db.user.create({ data: { fullName: "مدير كتب", email: `${TAG}@example.test`, phone: `+96478${String(Date.now()).slice(-8)}`, passwordHash: "x", role: "SUPER_ADMIN" } });
  actor = { adminId: (await db.adminUser.create({ data: { userId: u.id, permissions: [] } })).id, ip: "1.1.1.1" };
});
afterAll(async () => {
  await db.uploadedBook.deleteMany({ where: { id: { in: ids } } });
  await db.adminAuditLog.deleteMany({ where: { adminUserId: actor.adminId } });
  await db.user.deleteMany({ where: { email: `${TAG}@example.test` } });
  await db.$disconnect();
});

describe("book library", () => {
  it("rejects non-PDF content (by magic bytes, not by name) and empty files", async () => {
    expect(await uploadBook(actor, { name: "evil.pdf", bytes: new TextEncoder().encode("<script>alert(1)</script>") })).toEqual({ ok: false, code: "NOT_PDF" });
    expect(await uploadBook(actor, { name: "x.pdf", bytes: new Uint8Array() })).toEqual({ ok: false, code: "EMPTY_FILE" });
  });

  it("stores outside public with a generated key, extracts pages, and refuses duplicates", async () => {
    const r = await uploadBook(actor, { name: "../../كتاب الرياضيات\u0000.pdf", bytes: fx("math-ar.pdf") });
    if (!r.ok) throw new Error(r.code);
    ids.push(r.id);
    const b = await db.uploadedBook.findUniqueOrThrow({ where: { id: r.id } });
    expect(b.storageKey).toMatch(/^books\/[0-9a-f-]{36}\.pdf$/);
    expect(b.originalName).not.toContain("/");
    expect(existsSync(path.join(tmp, b.storageKey))).toBe(true);

    expect(await processBook(r.id)).toEqual({ ok: true, pageCount: 1, textPages: 1, ocrPages: 0 });
    const done = await db.uploadedBook.findUniqueOrThrow({ where: { id: r.id } });
    expect(done).toMatchObject({ status: "READY", pageCount: 1, textPageCount: 1, error: null });
    expect((await getBookPage(r.id, 1))?.text).toContain("حل المعادلة 3x + 5 = 20 ثم تحقق.");

    const dup = await uploadBook(actor, { name: "نسخة.pdf", bytes: fx("math-ar.pdf") });
    expect(dup).toEqual({ ok: false, code: "DUPLICATE", existingId: r.id });
  }, 60_000); // استخراج PDF حقيقي: أبطأ من 5 ث حين يعمل الجهاز بحمل

  it("image-only books: NEEDS_OCR when OCR is off; with OCR they become READY (OCR_USED) and pages are flagged isOcr", async () => {
    const r = await uploadBook(actor, { name: "مصور.pdf", bytes: fx("scanned-ar.pdf") });
    if (!r.ok) throw new Error(r.code);
    ids.push(r.id);
    await processBook(r.id, { ocr: false });
    expect(await db.uploadedBook.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "FAILED", error: "NEEDS_OCR", textPageCount: 0 });

    const res = await processBook(r.id, { ocr: true }); // إعادة المعالجة مسموحة
    expect(res).toEqual({ ok: true, pageCount: 1, textPages: 1, ocrPages: 1 });
    expect(await db.uploadedBook.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "READY", error: "OCR_USED", textPageCount: 1, processedPages: 1 });
    const pg = await getBookPage(r.id, 1);
    expect(pg?.isOcr).toBe(true);
    expect(pg?.text).toContain("الأعداد الطبيعية");
  }, 180_000);

  it("cancelling a queued OCR job stops it before any OCR work and leaves no pages", async () => {
    // بايتات إضافية غير مؤثرة في آخر الملف ليختلف الهاش عن الاختبار السابق (منع التكرار)
    const bytes = new Uint8Array([...fx("scanned-ar.pdf"), 10, 37, 37, 99, 97, 110, 99]);
    const r2 = await uploadBook(actor, { name: "للإلغاء.pdf", bytes });
    if (!r2.ok) throw new Error(r2.code);
    ids.push(r2.id);

    // نشغل الطابور بمهمة وهمية ليبقى OCR الكتاب منتظراً، ثم نلغي قبل أن يبدأ
    let release!: () => void;
    const hold = runOcrExclusive(() => new Promise<void>((res) => (release = res)));
    const job = processBook(r2.id, { ocr: true });
    await new Promise((res) => setTimeout(res, 1500)); // وقت كافٍ لينتهي استخراج النص ويصل الكتاب للطابور
    expect((await cancelProcessing(actor, [r2.id])).cancelled).toBe(1);
    release();
    await hold;
    expect(await job).toEqual({ ok: false, code: "CANCELLED" });
    expect(await db.uploadedBook.findUniqueOrThrow({ where: { id: r2.id } })).toMatchObject({ status: "FAILED", error: "CANCELLED" });
    expect(await db.bookPage.count({ where: { bookId: r2.id } })).toBe(0);
    // يمكن إعادة المحاولة بعد الإلغاء
    expect((await processBook(r2.id, { ocr: true })).ok).toBe(true);
  }, 180_000);

  it("a broken text layer (gibberish over a good image) is not trusted: OCR reads the real page; without OCR it is NEEDS_OCR", async () => {
    const r = await uploadBook(actor, { name: "طبقة-معطوبة.pdf", bytes: fx("garbled-layer.pdf") });
    if (!r.ok) throw new Error(r.code);
    ids.push(r.id);
    await processBook(r.id, { ocr: false });
    expect(await db.uploadedBook.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "FAILED", error: "NEEDS_OCR", textPageCount: 0 });
    expect((await getBookPage(r.id, 1))?.text).toBe(""); // الفاسد لا يُخزَّن

    expect(await processBook(r.id, { ocr: true })).toEqual({ ok: true, pageCount: 1, textPages: 1, ocrPages: 1 });
    const pg = await getBookPage(r.id, 1);
    expect(pg?.isOcr).toBe(true);
    expect(pg?.text).toContain("الأعداد الطبيعية");
    expect(pg?.text).not.toMatch(/Ib dg|Kjq/);
  }, 240_000);

  it("a book stuck in PROCESSING without a heartbeat can be reclaimed; a fresh one cannot; reopen returns a confirmed book to review", async () => {
    const r = await uploadBook(actor, { name: "عالق.pdf", bytes: new Uint8Array([...fx("math-ar.pdf"), 10, 37, 37, 115, 116, 107]) });
    if (!r.ok) throw new Error(r.code);
    ids.push(r.id);
    await db.uploadedBook.update({ where: { id: r.id }, data: { status: "PROCESSING" } });
    expect(await processBook(r.id, { ocr: false })).toEqual({ ok: false, code: "BUSY_OR_MISSING" }); // نبض حديث
    await db.$executeRaw`UPDATE "UploadedBook" SET "updatedAt" = now() - make_interval(secs => ${STALE_MS / 1000 + 60}) WHERE id = ${r.id}`;
    expect((await processBook(r.id, { ocr: false })).ok).toBe(true); // عالق ⇒ يُستعاد

    await db.uploadedBook.update({ where: { id: r.id }, data: { confirmedAt: new Date() } });
    expect((await reopenBook(actor, r.id)).ok).toBe(true);
    expect((await db.uploadedBook.findUniqueOrThrow({ where: { id: r.id } })).confirmedAt).toBeNull();
    expect(await reopenBook(actor, "nope")).toEqual({ ok: false, code: "NOT_FOUND" });
  }, 120_000);

  it("a pure image (no letters) stays unusable even with OCR", async () => {
    const r = await uploadBook(actor, { name: "رسم.pdf", bytes: fx("blank.pdf") });
    if (!r.ok) throw new Error(r.code);
    ids.push(r.id);
    await processBook(r.id, { ocr: true });
    expect(await db.uploadedBook.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "FAILED", error: "NEEDS_OCR", textPageCount: 0 });
  }, 120_000);

  it("never processes the same book twice at once", async () => {
    const r = await uploadBook(actor, { name: "نص.pdf", bytes: fx("text-ar.pdf") });
    if (!r.ok) throw new Error(r.code);
    ids.push(r.id);
    const res = await Promise.all([processBook(r.id), processBook(r.id)]);
    expect(res.filter((x) => x.ok)).toHaveLength(1);
    expect(await db.bookPage.count({ where: { bookId: r.id } })).toBe(2);
  });

  it("links to a curriculum, and delete removes record, pages and file", async () => {
    const id = ids[ids.length - 1];
    expect(await linkBook(actor, id, "notarealcurriculum0")).toEqual({ ok: false, code: "CURRICULUM_NOT_FOUND" });
    const key = (await db.uploadedBook.findUniqueOrThrow({ where: { id } })).storageKey;
    expect((await deleteBook(actor, id)).ok).toBe(true);
    expect(existsSync(path.join(tmp, key))).toBe(false);
    expect(await db.bookPage.count({ where: { bookId: id } })).toBe(0);
    expect(await db.adminAuditLog.count({ where: { adminUserId: actor.adminId, action: { in: ["book.upload", "book.delete"] } } })).toBeGreaterThanOrEqual(4);
  });
});

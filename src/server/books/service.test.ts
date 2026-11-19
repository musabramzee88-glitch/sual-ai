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
import { deleteBook, getBookPage, linkBook, processBook, uploadBook } from "./service";

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
  });

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

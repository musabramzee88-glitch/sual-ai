import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const tmp = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs"), os = require("node:os"), p = require("node:path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "sual-health-"));
  process.env.STORAGE_DIR = dir;
  return dir as string;
});

import { db } from "../db";
import { buildReport } from "./health";
import { loadBookInputs } from "./health-data";
import { processBook, uploadBook } from "./service";

const fx = (f: string) => new Uint8Array(readFileSync(path.resolve(__dirname, "../../../test/fixtures", f)));
const TAG = `hl${Date.now()}`;
let actor = { adminId: "", ip: "1.1.1.1" };
const ids: Record<string, string> = {};

beforeAll(async () => {
  const u = await db.user.create({ data: { fullName: "مدير فحص", email: `${TAG}@example.test`, phone: `+96478${String(Date.now()).slice(-8)}`, passwordHash: "x", role: "SUPER_ADMIN" } });
  actor = { adminId: (await db.adminUser.create({ data: { userId: u.id, permissions: [] } })).id, ip: "1.1.1.1" };
});
afterAll(async () => {
  await db.uploadedBook.deleteMany({ where: { id: { in: Object.values(ids) } } });
  await db.adminAuditLog.deleteMany({ where: { adminUserId: actor.adminId } });
  await db.user.deleteMany({ where: { email: `${TAG}@example.test` } });
  await db.$disconnect();
});

describe("health check on real processed books", () => {
  it("separates healthy text books, OCR books, unreadable images and a deleted file", async () => {
    for (const [key, file, ocr] of [["math", "math-ar.pdf", false], ["scan", "scanned-ar.pdf", true], ["blank", "blank.pdf", true], ["gone", "text-ar.pdf", false]] as const) {
      const r = await uploadBook(actor, { name: `${key}.pdf`, bytes: fx(file) });
      if (!r.ok) throw new Error(`${key}: ${r.code}`);
      ids[key] = r.id;
      await processBook(r.id, { ocr });
    }
    // احذف ملف أحد الكتب من القرص فقط
    await rm(path.join(tmp, (await db.uploadedBook.findUniqueOrThrow({ where: { id: ids.gone } })).storageKey));

    const inputs = (await loadBookInputs(db, tmp)).filter((b) => Object.values(ids).includes(b.id));
    const rep = buildReport(inputs);
    const by = (k: string) => rep.books.find((b) => b.id === ids[k])!;
    const codes = (k: string) => by(k).issues.map((i) => i.code);

    // نص عربي سليم: لا مقلوب ولا حروف متفرقة ولا رموز تالفة (الملاحظات الوحيدة: صغر الكتاب وعدم الربط)
    expect(codes("math")).not.toEqual(expect.arrayContaining(["REVERSED_TEXT"]));
    expect(codes("math").filter((c) => ["REVERSED_TEXT", "LETTER_SPACED_TEXT", "GARBAGE_CHARS", "MISSING_SPACES", "FILE_MISSING"].includes(c))).toEqual([]);
    expect(codes("math")).toContain("TOO_FEW_PAGES");
    expect(codes("scan")).toContain("OCR_USED");
    expect(by("scan").stats.ocrPages).toBe(1);
    expect(codes("blank")).toContain("FAILED_NEEDS_OCR");
    expect(by("blank").level).toBe("error");
    expect(codes("gone")).toContain("FILE_MISSING");
    expect(by("gone").level).toBe("error");
    expect(rep.books[0].level).toBe("error"); // الأخطاء أولاً
  }, 240_000);
});

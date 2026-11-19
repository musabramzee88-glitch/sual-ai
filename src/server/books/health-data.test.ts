import { readFileSync } from "node:fs";
import { appendFile, rm } from "node:fs/promises";
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
import { deepCheckBook, loadDeepTargets } from "./health-deep";
import { addIssues } from "./health";
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

  it("deep check: clean files pass; a tampered file, drifted stored text and a corrupted PDF are caught", async () => {
    const mk = async (key: string, file: string, bytes?: Uint8Array) => {
      const r = await uploadBook(actor, { name: `${key}.pdf`, bytes: bytes ?? fx(file) });
      if (!r.ok) throw new Error(`${key}: ${r.code}`);
      ids[key] = r.id;
      await processBook(r.id, { ocr: false });
      return r.id;
    };
    const clean = await mk("dclean", "text-ar.pdf", new Uint8Array([...fx("text-ar.pdf"), 10, 37, 37, 100, 49]));
    const tamper = await mk("dtamper", "text-ar.pdf", new Uint8Array([...fx("text-ar.pdf"), 10, 37, 37, 100, 50]));
    const drift = await mk("ddrift", "text-ar.pdf", new Uint8Array([...fx("text-ar.pdf"), 10, 37, 37, 100, 51]));

    // 1) عبث بالملف بعد الرفع (يبقى PDF صالحاً لكن بصمته تتغير)
    await appendFile(path.join(tmp, (await db.uploadedBook.findUniqueOrThrow({ where: { id: tamper } })).storageKey), "\n%tampered");
    // 2) تغيّر النص المخزَّن عن الملف (كأن المستخرِج تغيّر أو أُفسدت القاعدة)
    await db.bookPage.updateMany({ where: { bookId: drift }, data: { text: "نص مختلف تماماً عن الملف الأصلي في كل صفحة" } });

    const targets = (await loadDeepTargets(db)).filter((t) => [clean, tamper, drift].includes(t.id));
    const res = new Map<string, string[]>();
    for (const t of targets) res.set(t.id, (await deepCheckBook(t, tmp)).map((i) => i.code));
    expect(res.get(clean)).toEqual([]);
    expect(res.get(tamper)).toEqual(["HASH_MISMATCH"]);
    expect(res.get(drift)).toEqual(["STORED_TEXT_DRIFT"]);

    // 3) ملف ليس PDF بعد الرفع
    const rows = await db.uploadedBook.findUniqueOrThrow({ where: { id: clean } });
    await rm(path.join(tmp, rows.storageKey));
    await appendFile(path.join(tmp, rows.storageKey), "not a pdf at all");
    const t2 = (await loadDeepTargets(db)).find((t) => t.id === clean)!;
    expect((await deepCheckBook(t2, tmp)).map((i) => i.code)).toEqual(["HASH_MISMATCH", "PDF_UNREADABLE"]);

    // الدمج في التقرير يرفع المستوى ويعيد الترتيب والملخص
    const rep = buildReport((await loadBookInputs(db, tmp)).filter((b) => [tamper, drift].includes(b.id)));
    const before = rep.summary.error;
    const target = rep.books.find((b) => b.level !== "error")!.id; // كتاب غير خاطئ بعد
    addIssues(rep, target, [{ code: "HASH_MISMATCH", severity: "error" }]);
    expect(rep.summary.error).toBe(before + 1);
    expect(rep.books.find((b) => b.id === target)!.level).toBe("error");
    expect(rep.books.slice(0, rep.summary.error).every((b) => b.level === "error")).toBe(true); // الأخطاء أولاً
  }, 240_000);
});

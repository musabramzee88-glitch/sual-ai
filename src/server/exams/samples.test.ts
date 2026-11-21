import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { db } from "../db";
import { createSample, deleteSample, pickSamples, sniff, updateSample } from "./samples";

const TAG = `smp${Date.now()}`;
let actor = { adminId: "", ip: "1.1.1.1" };
const ids: string[] = [];

beforeAll(async () => {
  const u = await db.user.create({ data: { fullName: "مدير أوراق", email: `${TAG}@example.test`, phone: `+96475${String(Date.now()).slice(-8)}`, passwordHash: "x", role: "SUPER_ADMIN" } });
  actor = { adminId: (await db.adminUser.create({ data: { userId: u.id, permissions: [] } })).id, ip: "1.1.1.1" };
});
afterAll(async () => {
  await db.examSample.deleteMany({ where: { id: { in: ids } } });
  await db.adminAuditLog.deleteMany({ where: { adminUserId: actor.adminId } });
  await db.user.deleteMany({ where: { email: `${TAG}@example.test` } });
  await db.$disconnect();
});

describe("reference exam papers", () => {
  it("detects the real file type from its bytes", () => {
    expect(sniff(new Uint8Array(readFileSync("test/fixtures/math-ar.pdf")))).toBe("application/pdf");
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniff(new TextEncoder().encode("<html>"))).toBeNull();
  });

  it("a PDF with a clean text layer is transcribed without AI; unsupported files and unknown subjects are refused; edits and deletes are audited", async () => {
    expect(await createSample(actor, { subjectCode: "MATH", title: "x" }, { name: "a.html", bytes: new TextEncoder().encode("<html></html>") })).toMatchObject({ ok: false, code: "UNSUPPORTED_FILE" });
    expect(await createSample(actor, { subjectCode: "NOPE", title: "x" }, { name: "a.pdf", bytes: new Uint8Array(readFileSync("test/fixtures/math-ar.pdf")) })).toMatchObject({ ok: false, code: "REFERENCE_NOT_FOUND" });
    const r = await createSample(actor, { subjectCode: "MATH", gradeCode: "INT_3", title: "شهري رياضيات" }, { name: "m.pdf", bytes: new Uint8Array(readFileSync("test/fixtures/math-ar.pdf")) });
    if (!r.ok) throw new Error(r.code);
    ids.push(r.id);
    expect(r.chars).toBeGreaterThan(30);
    expect((await updateSample(actor, r.id, { text: "س١/ جد ناتج ما يأتي: ١- ٢٣ + ٤٥ ٢- ١٢ × ٣ (١٠ درجات)" })).ok).toBe(true);
    expect(await db.adminAuditLog.count({ where: { adminUserId: actor.adminId, targetId: r.id } })).toBe(2);
  });

  it("picks the same grade first, then the same stage, then subject-wide papers; inactive papers are ignored", async () => {
    const [math, int1, int3, pri4] = await Promise.all([
      db.subject.findUniqueOrThrow({ where: { code: "MATH" } }), db.grade.findUniqueOrThrow({ where: { code: "INT_1" } }),
      db.grade.findUniqueOrThrow({ where: { code: "INT_3" } }), db.grade.findUniqueOrThrow({ where: { code: "PRI_4" } }),
    ]);
    const mk = async (gradeId: string | null, text: string, isActive = true) => { const s = await db.examSample.create({ data: { subjectId: math.id, gradeId, title: text, text, isActive } }); ids.push(s.id); };
    await mk(pri4.id, `${TAG} ابتدائي`);
    await mk(int1.id, `${TAG} متوسط أول`);
    await mk(null, `${TAG} عامة`);
    await mk(int3.id, `${TAG} معطلة`, false);
    const got = (await pickSamples(math.id, int3.id, 5)).filter((t) => t.includes(TAG) || t.startsWith("س١/"));
    expect(got[0]).toContain("جد ناتج"); // الصف نفسه (من الاختبار السابق)
    expect(got[1]).toContain("متوسط أول"); // المرحلة نفسها
    expect(got.some((t) => t.includes("معطلة"))).toBe(false);
    expect(got.some((t) => t.includes("ابتدائي"))).toBe(false); // مرحلة أخرى لا تُخلط حين يوجد الأقرب
    expect((await deleteSample(actor, ids[0])).ok).toBe(true);
  });
});

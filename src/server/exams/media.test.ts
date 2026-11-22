import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";

const { db } = await import("../db");
const M = await import("./media");
const { assetPath } = await import("./assets");
const { duplicateQuestion } = await import("./service");
const { examRenderInput } = await import("./templates");

const TAG = `md${Date.now()}`;
let userId = "", otherId = "", examId = "", q1 = "";
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
const PNG2 = Uint8Array.from([...PNG, 0]); // محتوى مختلف (بصمة مختلفة) لكنه يبدأ بترويسة PNG

beforeAll(async () => {
  const [track, grade, subject] = await Promise.all([
    db.curriculumTrack.findUniqueOrThrow({ where: { code: "GENERAL" } }),
    db.grade.findUniqueOrThrow({ where: { code: "PRI_5" } }),
    db.subject.findUniqueOrThrow({ where: { code: "SCIENCE" } }),
  ]);
  userId = (await db.user.create({ data: { fullName: "مدرس", email: `${TAG}@example.test`, phone: `+96473${String(Date.now()).slice(-8)}`, passwordHash: "x" } })).id;
  otherId = (await db.user.create({ data: { fullName: "آخر", email: `${TAG}b@example.test`, phone: `+96472${String(Date.now()).slice(-8)}`, passwordHash: "x" } })).id;
  const exam = await db.exam.create({ data: { ownerId: userId, trackId: track.id, gradeId: grade.id, subjectId: subject.id, title: "امتحان", kind: "QUIZ", totalMarks: 6, settings: {}, status: "READY" } });
  examId = exam.id;
  const model = await db.examModel.create({ data: { examId, label: "A" } });
  const parent = await db.examQuestion.create({ data: { examModelId: model.id, sortOrder: 0, type: "DEFINE", instruction: "عرّف:", prompt: "عرّف:", marks: 6, sourcePages: [] } });
  q1 = (await db.examQuestion.create({ data: { examModelId: model.id, parentId: parent.id, sortOrder: 0, type: "DEFINE", prompt: "الخلية", answer: "وحدة", marks: 6, sourcePages: [3] } })).id;
});

afterAll(async () => {
  await db.exam.deleteMany({ where: { ownerId: { in: [userId, otherId] } } });
  for (const a of await db.templateAsset.findMany({ where: { ownerId: { in: [userId, otherId] } } })) await db.templateAsset.delete({ where: { id: a.id } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await db.$disconnect();
});

describe("question images and tables", () => {
  it("accepts PNG/JPEG by content only, caps the size, and keeps images private to the owner", async () => {
    expect(await M.setQuestionImage(userId, q1, new TextEncoder().encode("<svg onload=alert(1)>"))).toEqual({ ok: false, code: "UNSUPPORTED_FILE" });
    expect(await M.setQuestionImage(userId, q1, new Uint8Array(M.MAX_QUESTION_IMAGE_BYTES + 1))).toEqual({ ok: false, code: "FILE_TOO_LARGE" });
    expect(await M.setQuestionImage(otherId, q1, PNG)).toEqual({ ok: false, code: "NOT_FOUND" });
    const r = await M.setQuestionImage(userId, q1, PNG);
    if (!r.ok) throw new Error(r.code);
    expect((await M.questionImageBytes(userId, q1))?.mime).toBe("image/png");
    expect(await M.questionImageBytes(otherId, q1)).toBeNull();
    expect(Object.keys(await M.imageDataUris(otherId, [r.id]))).toEqual([]);
    expect((await M.imageDataUris(userId, [r.id]))[r.id]).toMatch(/^data:image\/png;base64,/);
  });
  it("the sheet carries the image; a copy shares it; the file goes away only when nothing uses it", async () => {
    const input = (await examRenderInput(userId, examId))!;
    expect(input.renderExam.sections[0].branches[0].image).toMatch(/^data:image\/png;base64,/);
    const copy = await duplicateQuestion(userId, q1);
    if (!copy.ok) throw new Error(copy.code);
    const row = await db.examQuestion.findUniqueOrThrow({ where: { id: q1 }, select: { imageAssetId: true } });
    const asset = await db.templateAsset.findUniqueOrThrow({ where: { id: row.imageAssetId! } });
    expect((await db.examQuestion.findUniqueOrThrow({ where: { id: copy.id } })).imageAssetId).toBe(row.imageAssetId); // مرجع مشترك
    expect(await M.removeQuestionImage(userId, q1)).toEqual({ ok: true });
    expect(existsSync(assetPath(asset.storageKey))).toBe(true); // النسخة ما زالت تستعملها
    expect(await M.removeQuestionImage(userId, copy.id)).toEqual({ ok: true });
    expect(existsSync(assetPath(asset.storageKey))).toBe(false);
    expect(await db.templateAsset.findUnique({ where: { id: asset.id } })).toBeNull();
  });
  it("replacing an image drops the old one; the same bytes are stored once", async () => {
    const a = await M.setQuestionImage(userId, q1, PNG);
    const b = await M.setQuestionImage(userId, q1, PNG2);
    if (!a.ok || !b.ok) throw new Error("upload");
    expect(a.id).not.toBe(b.id);
    expect(await db.templateAsset.findUnique({ where: { id: a.id } })).toBeNull();
    const again = await M.setQuestionImage(userId, q1, PNG2);
    expect(again).toEqual({ ok: true, id: b.id });
    expect(await M.removeQuestionImage(userId, q1)).toEqual({ ok: true });
  });
  it("tables: validated shape (rectangular, ≤12×8), saved, shown on the sheet, removable", async () => {
    expect(M.tableSchema.safeParse({ header: true, cells: [["a", "b"], ["c"]] }).success).toBe(false); // غير مستطيل
    expect(M.tableSchema.safeParse({ header: true, cells: Array.from({ length: 13 }, () => ["a"]) }).success).toBe(false);
    expect(M.tableSchema.safeParse({ header: true, cells: [Array(9).fill("a")] }).success).toBe(false);
    expect(M.tableSchema.safeParse({ header: false, cells: [["x".repeat(121)]] }).success).toBe(false);
    const t = { header: true, cells: [["الكمية", "القيمة"], ["", ""]] };
    expect(await M.setQuestionTable(otherId, q1, t)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await M.setQuestionTable(userId, q1, t)).toEqual({ ok: true });
    expect((await examRenderInput(userId, examId))!.renderExam.sections[0].branches[0].table).toEqual(t);
    expect(await M.setQuestionTable(userId, q1, null)).toEqual({ ok: true });
    expect((await examRenderInput(userId, examId))!.renderExam.sections[0].branches[0].table).toBeNull();
  });
});

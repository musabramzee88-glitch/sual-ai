import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import JSZip from "jszip";

const chromium = process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : "");
if (chromium) process.env.CHROMIUM_PATH = chromium;

const { db } = await import("../db");
const X = await import("./export");

const TAG = `ex${Date.now()}`;
let userId = "", otherId = "", examId = "";

beforeAll(async () => {
  const [track, grade, subject] = await Promise.all([
    db.curriculumTrack.findUniqueOrThrow({ where: { code: "GENERAL" } }),
    db.grade.findUniqueOrThrow({ where: { code: "PRI_5" } }),
    db.subject.findUniqueOrThrow({ where: { code: "SCIENCE" } }),
  ]);
  userId = (await db.user.create({ data: { fullName: "مدرس", email: `${TAG}@example.test`, phone: `+96471${String(Date.now()).slice(-8)}`, passwordHash: "x" } })).id;
  otherId = (await db.user.create({ data: { fullName: "آخر", email: `${TAG}b@example.test`, phone: `+96470${String(Date.now()).slice(-8)}`, passwordHash: "x" } })).id;
  const exam = await db.exam.create({ data: { ownerId: userId, trackId: track.id, gradeId: grade.id, subjectId: subject.id, title: "امتحان العلوم: الشهري؟", kind: "MONTHLY", totalMarks: 10, settings: {}, status: "READY" } });
  examId = exam.id;
  const model = await db.examModel.create({ data: { examId, label: "A" } });
  const parent = await db.examQuestion.create({ data: { examModelId: model.id, sortOrder: 0, type: "MCQ", instruction: "اختر:", prompt: "اختر:", marks: 10, sourcePages: [] } });
  for (let i = 0; i < 5; i++) await db.examQuestion.create({ data: { examModelId: model.id, parentId: parent.id, sortOrder: i, type: "MCQ", prompt: `سؤال ${i + 1}`, options: ["أول", "ثاني", "ثالث"], answer: "ثاني", marks: 2, sourcePages: [3] } });
});

afterAll(async () => {
  await db.exam.deleteMany({ where: { ownerId: { in: [userId, otherId] } } });
  await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await db.$disconnect();
});

describe("export (Word and ZIP)", () => {
  it("builds a Word file for the owner only, with a safe readable name", async () => {
    const f = (await X.buildFile(userId, examId, { format: "docx", variant: "questions" }))!;
    expect(f.ext).toBe("docx");
    expect(f.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(X.fileNameOf(f)).toBe("امتحان العلوم الشهري؟.docx"); // محارف ويندوز الممنوعة أُزيلت
    expect(X.fileNameOf(f, "اسمي: الخاص")).toBe("اسمي الخاص.docx");
    expect(await X.buildFile(otherId, examId, { format: "docx", variant: "questions" })).toBeNull();
  });
  it("a model gets its own name and different question order", async () => {
    const a = (await X.buildFile(userId, examId, { format: "docx", variant: "key", model: "A" }))!;
    const c = (await X.buildFile(userId, examId, { format: "docx", variant: "key", model: "C" }))!;
    expect(X.fileNameOf(c)).toContain("نموذج ج");
    expect(X.fileNameOf(c)).toContain("الإجابات");
    const xmlOf = async (b: Buffer) => (await (await JSZip.loadAsync(b)).file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
    expect(await xmlOf(a.bytes)).not.toBe(await xmlOf(c.bytes));
  });
  it("a ZIP holds one file per model × variant with unique names, and is owner-only", async () => {
    const z = (await X.buildZip(userId, examId, { format: "docx", models: ["A", "B", "C", "D"], variants: ["questions", "key", "sheet"] }))!;
    expect(z.count).toBe(12);
    const zip = await JSZip.loadAsync(z.bytes);
    const names = Object.keys(zip.files);
    expect(names).toHaveLength(12);
    expect(new Set(names).size).toBe(12);
    expect(names.every((n) => n.endsWith(".docx"))).toBe(true);
    expect(names.some((n) => n.includes("نموذج د") && n.includes("ورقة الإجابة"))).toBe(true);
    expect(await X.buildZip(otherId, examId, { format: "docx", models: [null], variants: ["questions"] })).toBeNull();
    const one = (await X.buildZip(userId, examId, { format: "docx", models: [null], variants: ["questions"] }))!;
    expect(Object.keys((await JSZip.loadAsync(one.bytes)).files)).toEqual(["امتحان العلوم الشهري؟.docx"]);
  });
});

describe.skipIf(!chromium)("PDF in a ZIP", () => {
  it("renders real PDFs for each requested copy", async () => {
    const z = (await X.buildZip(userId, examId, { format: "pdf", models: ["A", "B"], variants: ["questions"] }))!;
    const zip = await JSZip.loadAsync(z.bytes);
    const names = Object.keys(zip.files);
    expect(names).toHaveLength(2);
    for (const n of names) expect((await zip.file(n)!.async("nodebuffer")).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 120_000);
});

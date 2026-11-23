import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";

// PDF حقيقي بمتصفح Chromium (يُتخطّى إن لم يوجد متصفح). env يُقرأ عند الاستيراد، لذا يُضبط قبله
const chromium = process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : "");
if (chromium) process.env.CHROMIUM_PATH = chromium;

const { db } = await import("../db");
const T = await import("./templates");
const { renderExamHtml } = await import("@/lib/exam-render");

const TAG = `tp${Date.now()}`;
let userId = "", otherId = "", examId = "";
// PNG 1×1 صالح
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));

const base = (over: Partial<import("./templates").TemplateInput> = {}): import("./templates").TemplateInput => ({
  name: "قالب مدرستي", layout: "SCHOOL", pageSize: "A4", orientation: "PORTRAIT", fontFamily: "Traditional Arabic", fontSizePt: 14, lineSpacing: 1.5,
  margins: { top: 12, right: 14, bottom: 12, left: 14 }, showPageNumbers: true, visible: { teacher: true }, values: { school: "ثانوية الرافدين", teacher: "أ. علي حسن" },
  answerLines: 0, footerNote: "مع تمنياتنا لكم بالنجاح", signLine: false, accent: null, maxPages: 2, logoAssetId: null, isDefault: true, ...over,
});

beforeAll(async () => {
  const [track, grade, subject] = await Promise.all([
    db.curriculumTrack.findUniqueOrThrow({ where: { code: "GENERAL" } }),
    db.grade.findUniqueOrThrow({ where: { code: "PRI_5" } }),
    db.subject.findUniqueOrThrow({ where: { code: "SCIENCE" } }),
  ]);
  userId = (await db.user.create({ data: { fullName: "مدرس", email: `${TAG}@example.test`, phone: `+96475${String(Date.now()).slice(-8)}`, passwordHash: "x" } })).id;
  otherId = (await db.user.create({ data: { fullName: "آخر", email: `${TAG}b@example.test`, phone: `+96474${String(Date.now()).slice(-8)}`, passwordHash: "x" } })).id;
  const exam = await db.exam.create({ data: { ownerId: userId, trackId: track.id, gradeId: grade.id, subjectId: subject.id, title: "الامتحان الشهري", kind: "MONTHLY", totalMarks: 10, durationMinutes: 45, settings: {}, status: "READY" } });
  examId = exam.id;
  const model = await db.examModel.create({ data: { examId, label: "A" } });
  const parent = await db.examQuestion.create({ data: { examModelId: model.id, sortOrder: 0, type: "DEFINE", instruction: "عرّف ما يأتي:", prompt: "عرّف ما يأتي:", marks: 10, sourcePages: [] } });
  await db.examQuestion.create({ data: { examModelId: model.id, parentId: parent.id, sortOrder: 0, type: "DEFINE", prompt: "البناء الضوئي", answer: "عملية يصنع بها النبات غذاءه", marks: 10, sourcePages: [3] } });
});

afterAll(async () => {
  await db.exam.deleteMany({ where: { ownerId: { in: [userId, otherId] } } });
  for (const a of await db.templateAsset.findMany({ where: { ownerId: { in: [userId, otherId] } } })) await T.deleteLogo(a.ownerId, a.id);
  await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await db.$disconnect();
});

describe("sheet templates", () => {
  it("validates templates (fonts, sizes, field keys)", () => {
    expect(T.templateSchema.safeParse(base()).success).toBe(true);
    expect(T.templateSchema.safeParse({ ...base(), fontFamily: "Comic Sans" }).success).toBe(false);
    expect(T.templateSchema.safeParse({ ...base(), fontSizePt: 40 }).success).toBe(false);
    expect(T.templateSchema.safeParse({ ...base(), accent: "#1e40af" }).success).toBe(true);
    expect(T.templateSchema.safeParse({ ...base(), accent: "red; background:url(x)" }).success).toBe(false); // لا حقن CSS
    expect(T.templateSchema.safeParse({ ...base(), values: { hacker: "x" } }).success).toBe(false);
  });

  it("logos: PNG/JPEG only (by content), deduplicated, private to the owner", async () => {
    expect(await T.uploadLogo(userId, new TextEncoder().encode("<svg onload=alert(1)>"))).toEqual({ ok: false, code: "UNSUPPORTED_FILE" });
    const a = await T.uploadLogo(userId, PNG);
    if (!a.ok) throw new Error(a.code);
    expect(await T.uploadLogo(userId, PNG)).toEqual({ ok: true, id: a.id });
    expect(await T.logoDataUri(userId, a.id)).toMatch(/^data:image\/png;base64,/);
    expect(await T.logoDataUri(otherId, a.id)).toBeNull();
    // لا يُستعمل شعار مدرس آخر في قالب
    expect(await T.createTemplate(otherId, base({ logoAssetId: a.id }))).toEqual({ ok: false, code: "LOGO_NOT_FOUND" });
  });

  it("one default per teacher; others cannot edit or use my templates", async () => {
    const a = await T.createTemplate(userId, base());
    const b = await T.createTemplate(userId, base({ name: "ثاني" }));
    if (!a.ok || !b.ok) throw new Error("create");
    const list = await T.listTemplates(userId);
    expect(list.filter((x) => x.isDefault).map((x) => x.id)).toEqual([b.id]);
    expect(list.filter((x) => x.preset)).toHaveLength(4);
    expect(await T.updateTemplate(otherId, a.id, base())).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await T.deleteTemplate(otherId, a.id)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await T.setExamHeader(otherId, examId, { templateId: null, values: {} })).toEqual({ ok: false, code: "NOT_FOUND" });
    const other = await T.createTemplate(otherId, base({ isDefault: false }));
    if (!other.ok) throw new Error("create");
    expect(await T.setExamHeader(userId, examId, { templateId: other.id, values: {} })).toEqual({ ok: false, code: "TEMPLATE_NOT_FOUND" });
    await T.deleteTemplate(userId, b.id);
  });

  it("the exam sheet merges exam data, template values and per-exam header values (exam wins)", async () => {
    // بلا اختيار: افتراضي المدرس (لا يوجد بعد حذف الثاني) ⇒ الكلاسيكي
    let input = (await T.examRenderInput(userId, examId))!;
    expect(input.template.id).toBe("preset:CLASSIC");
    const mine = (await T.listTemplates(userId)).find((x) => !x.preset)!;
    expect(await T.setExamHeader(userId, examId, { templateId: mine.id, values: { teacher: "أ. زينب", round: "الأول" } })).toEqual({ ok: true });
    input = (await T.examRenderInput(userId, examId))!;
    expect(input.renderExam.values).toMatchObject({ subject: "العلوم", total: "١٠ درجة", time: "٤٥ دقيقة", teacher: "أ. زينب", examKind: "الامتحان الشهري" });
    const html = renderExamHtml(input.renderExam, input.renderTemplate, "QUESTIONS_ONLY");
    expect(html).toContain("ثانوية الرافدين");
    expect(html).toContain("أ. زينب");
    expect(html).not.toContain("أ. علي حسن");
    expect(html).not.toContain("عملية يصنع"); // لا إجابات في ورقة الأسئلة
    expect(await T.examRenderInput(otherId, examId)).toBeNull();
    // النموذج: الأصل A كما هو، وB مشتق، والاسم يظهر في الترويسة ولو كان حقل النموذج مخفياً
    const a = (await T.examRenderInput(userId, examId, { model: "A" }))!;
    const b = (await T.examRenderInput(userId, examId, { model: "B" }))!;
    expect(a.renderExam.values.model).toBe("أ");
    expect(b.renderExam.values.model).toBe("ب");
    expect(renderExamHtml(b.renderExam, b.renderTemplate, "QUESTIONS_ONLY")).toContain("النموذج:</span> ب");
    expect(b.renderExam.sections[0].branches).toHaveLength(a.renderExam.sections[0].branches.length);
    expect((await T.examRenderInput(userId, examId))!.renderExam.sections).toEqual(a.renderExam.sections);
    // قالب جاهز يُحفظ مع الامتحان أيضاً
    expect(await T.setExamHeader(userId, examId, { templateId: "preset:MINIMAL", values: {} })).toEqual({ ok: true });
    expect((await T.examRenderInput(userId, examId))!.template.layout).toBe("MINIMAL");
    expect(await T.setExamHeader(userId, examId, { templateId: "preset:NOPE", values: {} })).toEqual({ ok: false, code: "TEMPLATE_NOT_FOUND" });
  });
});

describe.skipIf(!chromium)("PDF export", () => {
  it("renders the sheet to a real A4 PDF with Arabic text", async () => {
    const { htmlToPdf } = await import("./pdf");
    const input = (await T.examRenderInput(userId, examId))!;
    const pdf = await htmlToPdf(renderExamHtml(input.renderExam, input.renderTemplate, "ANSWER_KEY", { forPdf: true }), { pageNumbers: true, lang: "ar" });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({ data: new Uint8Array(pdf) }).promise;
    const page = await doc.getPage(1);
    const [w, h] = (page.view as number[]).slice(2);
    expect(Math.round(w)).toBe(595); // A4 بالنقاط
    expect(Math.round(h)).toBe(842);
    const text = (await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
    expect(text).toContain("1"); // ترقيم الصفحات
    expect(text.normalize("NFKC").replace(/\s+/g, "")).toMatch(/عملية|ةيلمع/); // نص الإجابة موجود في PDF (أشكال العرض ← NFKC)
  }, 90_000);
});

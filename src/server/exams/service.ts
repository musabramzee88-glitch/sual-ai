import "server-only";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { AiError, currentModel, geminiJson } from "../ai/gemini";
import { renderPagesJpeg } from "../books/page-image";
import { fileOf } from "../books/service";
import { normalizeHonorifics, polishQuestion } from "@/lib/exam-text";
import { distributeMarks, type MarkSection } from "./marks";
import { pickSamples } from "./samples";
import {
  buildPrompt, chooseInstruction, expandRanges, pickImagePages, RESPONSE_SCHEMA, sortIntoSections,
  type CleanQuestion, type CreateExamInput, type GenType, type RawQuestion, type Section, type SourcePage,
} from "./core";

/**
 * توليد الامتحانات: المصدر = صفحات كتاب المنهج (فصول مختارة أو نطاق صفحات)، والنموذج يكتب الأسئلة من هذه الصفحات فقط.
 * صفحات OCR/الضعيفة تُرسل صوراً (حتى MAX_IMAGES) لأن نصها قد يحوي أخطاء. كل سؤال يحمل sourcePages ويُراجعه المدرس.
 */
const MAX_IMAGES = 10;
const MAX_PAGE_CHARS = 3000;
const MAX_TOTAL_CHARS = 160_000;

type Fail = { ok: false; code: string; detail?: string };
const fail = (code: string, detail?: string): Fail => ({ ok: false, code, detail });

/** المناهج المتاحة للتوليد: السنة الحالية، مفعّلة، ولها كتاب جاهز */
export async function examOptions() {
  const year = await db.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) return [];
  const rows = await db.curriculum.findMany({
    where: { academicYearId: year.id, isActive: true, books: { some: { status: "READY", ownerId: null } } },
    select: {
      id: true, title: true, kind: true, part: true, language: true,
      grade: { select: { code: true, nameAr: true, nameEn: true, sortOrder: true, stage: { select: { sortOrder: true } } } },
      subject: { select: { code: true, nameAr: true, nameEn: true, questionTypes: true } },
      track: { select: { code: true, nameAr: true, nameEn: true } },
      chapters: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true, pageStart: true, pageEnd: true } },
      books: { where: { status: "READY", ownerId: null }, select: { pageCount: true }, take: 1 },
    },
  });
  return rows
    .map((c) => ({ ...c, pageCount: c.books[0]?.pageCount ?? 0, books: undefined }))
    .sort((a, b) => a.grade.stage.sortOrder - b.grade.stage.sortOrder || a.grade.sortOrder - b.grade.sortOrder || a.subject.nameAr.localeCompare(b.subject.nameAr) || a.kind.localeCompare(b.kind) || a.part - b.part);
}

async function loadSource(bookId: string, storageKey: string, pageNumbers: number[]): Promise<{ pages: SourcePage[]; images: { data: Buffer; mime: "image/jpeg" }[] }> {
  const rows = await db.bookPage.findMany({ where: { bookId, pageNumber: { in: pageNumbers } }, select: { pageNumber: true, text: true, isOcr: true }, orderBy: { pageNumber: "asc" } });
  const imageSet = pickImagePages(rows.map((r) => ({ pageNumber: r.pageNumber, isOcr: r.isOcr, textLen: r.text.trim().length })), MAX_IMAGES);
  let budget = MAX_TOTAL_CHARS;
  const pages: SourcePage[] = rows.map((r) => {
    const asImage = imageSet.has(r.pageNumber);
    const text = asImage ? "" : r.text.slice(0, Math.min(MAX_PAGE_CHARS, Math.max(0, budget)));
    budget -= text.length;
    return { pageNumber: r.pageNumber, text, isOcr: r.isOcr, asImage };
  }).filter((p) => p.asImage || p.text.trim().length > 0);
  let images: { data: Buffer; mime: "image/jpeg" }[] = [];
  const imgPages = pages.filter((p) => p.asImage).map((p) => p.pageNumber);
  if (imgPages.length) {
    const bytes = new Uint8Array(await readFile(fileOf(storageKey)));
    images = (await renderPagesJpeg(bytes, imgPages, 1400)).map((r) => ({ data: r.jpeg, mime: "image/jpeg" as const }));
  }
  return { pages, images };
}

/** نطاقات متصلة من قائمة صفحات (لـ ExamSource) */
function toRanges(pages: number[]): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const n of [...pages].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && n === last.to + 1) last.to = n;
    else out.push({ from: n, to: n });
  }
  return out;
}

type Ctx = { subject: string; grade: string; lang: "AR" | "EN"; useLatinSymbols: boolean; family: string; samples: string[] };

async function askModel(ctx: Ctx, difficulty: CreateExamInput["difficulty"], sections: Section[], src: Awaited<ReturnType<typeof loadSource>>, avoid?: string[]) {
  const prompt = buildPrompt({ ...ctx, difficulty, sections, pages: src.pages, avoid });
  const r = await geminiJson<{ questions?: RawQuestion[]; sectionInstructions?: { section: number; instruction: string }[] }>({ prompt, images: src.images, schema: RESPONSE_SCHEMA, maxOutputTokens: 16_384 });
  // نص الصفحة الموثوق (طبقة نص أصلية، لا OCR ولا صورة) للتحقق من النصوص المنقولة حرفياً
  const allowed = new Map(src.pages.map((p) => [p.pageNumber, { text: p.text, trusted: !p.isOcr && !p.asImage }]));
  const sorted = sortIntoSections(r.questions ?? [], sections, allowed, ctx.lang);
  // تعليمة كل قسم: بصياغة أوراق المرجع إن وُجدت، وإلا الافتراضية
  const h = ctx.lang === "AR" ? normalizeHonorifics : (x: string) => x;
  const instructions = sections.map((sec, i) => h(chooseInstruction(sec.type, ctx.lang, r.sectionInstructions?.find((x) => x.section === i)?.instruction, ctx.samples.length > 0)));
  return { ...sorted, instructions };
}

const snapshot = (q: { prompt: string; options: unknown; answer: string | null; marks: unknown; sourcePages: number[] }) =>
  ({ prompt: q.prompt, options: (q.options ?? null) as Prisma.InputJsonValue, answer: q.answer, marks: String(q.marks), sourcePages: q.sourcePages }) as Prisma.InputJsonValue;

export async function createExam(userId: string, input: CreateExamInput) {
  const cur = await db.curriculum.findUnique({
    where: { id: input.curriculumId },
    include: { subject: true, grade: true, chapters: true, books: { where: { status: "READY", ownerId: null }, take: 1 } },
  });
  if (!cur || !cur.isActive) return fail("CURRICULUM_NOT_FOUND");
  const book = cur.books[0];
  if (!book?.pageCount) return fail("NO_BOOK");
  // أنواع الأسئلة المسموحة للمادة (إن حُدّدت)
  if (cur.subject.questionTypes.length && input.sections.some((s) => !cur.subject.questionTypes.includes(s.type))) return fail("TYPE_NOT_ALLOWED");

  let ranges: { from: number; to: number }[];
  let chapterId: string | null = null;
  if (input.chapterIds?.length) {
    const chosen = cur.chapters.filter((c) => input.chapterIds!.includes(c.id));
    if (chosen.length !== input.chapterIds.length || chosen.some((c) => c.pageStart == null || c.pageEnd == null)) return fail("CHAPTER_NOT_FOUND");
    ranges = chosen.map((c) => ({ from: c.pageStart!, to: c.pageEnd! }));
    if (chosen.length === 1) chapterId = chosen[0].id;
  } else {
    if (input.pageTo! > book.pageCount) return fail("PAGE_OUT_OF_RANGE");
    ranges = [{ from: input.pageFrom!, to: input.pageTo! }];
  }
  const { pages: pageNumbers, truncated } = expandRanges(ranges, book.pageCount);
  if (pageNumbers.length === 0) return fail("EMPTY_SOURCE");

  const lang = cur.language === "EN" ? "EN" : "AR";
  const ctx: Ctx = { subject: lang === "EN" ? cur.subject.nameEn : cur.subject.nameAr, grade: lang === "EN" ? cur.grade.nameEn : cur.grade.nameAr, lang, useLatinSymbols: cur.subject.useLatinSymbols, family: cur.subject.family, samples: await pickSamples(cur.subjectId, cur.gradeId) };
  const totalMarks = input.sections.reduce((n, s) => n + s.count * s.marksEach, 0);

  const exam = await db.exam.create({
    data: {
      ownerId: userId, curriculumId: cur.id, trackId: cur.trackId, gradeId: cur.gradeId, branchId: cur.branchId, subjectId: cur.subjectId,
      title: input.title ?? `${ctx.subject} — ${ctx.grade}`, kind: input.kind, language: lang, durationMinutes: input.durationMinutes, totalMarks, difficulty: input.difficulty,
      settings: { sections: input.sections, pages: pageNumbers, truncated, bookId: book.id } as Prisma.InputJsonValue,
      status: "GENERATING",
      sources: { create: toRanges(pageNumbers).map((r) => ({ bookId: book.id, pageFrom: r.from, pageTo: r.to })) },
    },
  });
  const job = await db.examGenerationJob.create({ data: { examId: exam.id, status: "RUNNING", aiProvider: "gemini", aiModel: currentModel(), startedAt: new Date() } });

  try {
    const src = await loadSource(book.id, book.storageKey, pageNumbers);
    if (src.pages.length === 0) throw new AiError("BAD_RESPONSE", "EMPTY_SOURCE_TEXT");
    const { bySection, dropped, instructions } = await askModel(ctx, input.difficulty, input.sections, src);
    const made = bySection.reduce((n, s) => n + s.length, 0);
    if (made === 0) throw new AiError("BAD_RESPONSE", "NO_VALID_QUESTIONS");

    await db.$transaction(async (tx) => {
      const model = await tx.examModel.create({ data: { examId: exam.id, label: "A" } });
      for (const [i, s] of input.sections.entries()) {
        const qs = bySection[i];
        if (qs.length === 0) continue;
        const parent = await tx.examQuestion.create({
          data: { examModelId: model.id, sortOrder: i + 1, type: s.type, instruction: instructions[i], prompt: instructions[i], marks: s.marksEach * qs.length, sourcePages: [], chapterId },
        });
        for (const [j, q] of qs.entries()) await createChild(tx, model.id, parent.id, j + 1, s, q, chapterId, userId);
      }
      const realMarks = input.sections.reduce((n, s, i) => n + s.marksEach * bySection[i].length, 0);
      await tx.exam.update({ where: { id: exam.id }, data: { status: "READY", totalMarks: realMarks, settings: { sections: input.sections, pages: pageNumbers, truncated, bookId: book.id, imagePages: src.pages.filter((p) => p.asImage).map((p) => p.pageNumber), ocrPages: src.pages.filter((p) => p.isOcr).map((p) => p.pageNumber), dropped, made } as Prisma.InputJsonValue } });
      await tx.examGenerationJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", finishedAt: new Date(), aiModel: currentModel() } });
    });
    // درجة كلية مطلوبة: توزيعها تلقائياً على ما كُتب فعلاً
    if (input.totalMarks) await distributeExamMarks(userId, exam.id, input.totalMarks, input.distribution ?? "smart");
    return { ok: true as const, examId: exam.id, made, requested: input.sections.reduce((n, s) => n + s.count, 0) };
  } catch (e) {
    const code = e instanceof AiError ? (e.code === "QUOTA" ? "AI_QUOTA" : e.code === "NO_KEY" ? "AI_UNAVAILABLE" : "AI_FAILED") : "AI_FAILED";
    await db.exam.update({ where: { id: exam.id }, data: { status: "FAILED" } });
    await db.examGenerationJob.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: new Date(), error: (e as Error).message.slice(0, 500) } });
    console.error(`[exams] generation failed for ${exam.id}: ${(e as Error).name}`);
    return { ...fail(code), examId: exam.id };
  }
}

async function createChild(tx: Prisma.TransactionClient, modelId: string, parentId: string, order: number, s: Section, q: CleanQuestion, chapterId: string | null, userId: string) {
  const created = await tx.examQuestion.create({
    data: {
      examModelId: modelId, parentId, sortOrder: order, type: s.type, prompt: q.prompt, options: q.options ?? Prisma.DbNull, answer: q.answer,
      marks: s.marksEach, difficulty: q.difficulty, cognitiveLevel: q.cognitiveLevel, sourcePages: q.sourcePages, chapterId,
    },
  });
  await tx.examQuestionRevision.create({ data: { questionId: created.id, version: 1, reason: "CREATE", snapshot: snapshot(created), editedById: userId } });
  return created;
}

export const listExams = (userId: string) =>
  db.exam.findMany({
    where: { ownerId: userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, title: true, status: true, totalMarks: true, createdAt: true, subject: { select: { nameAr: true, nameEn: true } }, grade: { select: { nameAr: true, nameEn: true } } },
  });

export async function getExam(userId: string, id: string) {
  const exam = await db.exam.findFirst({
    where: { id, ownerId: userId, deletedAt: null },
    include: {
      subject: true, grade: true,
      models: { include: { questions: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } } },
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!exam) return null;
  // امتحانات سابقة قد تحوي (ص)/(ع): تُعرض وتُطبع بالصيغ الكاملة
  const h = exam.language === "AR" ? normalizeHonorifics : (x: string) => x;
  const all = (exam.models[0]?.questions ?? []).map((q) => ({
    ...q, prompt: h(q.prompt), instruction: q.instruction ? h(q.instruction) : q.instruction, answer: q.answer ? h(q.answer) : q.answer,
    options: Array.isArray(q.options) ? (q.options as string[]).map(h) : q.options,
  }));
  const sections = all.filter((q) => !q.parentId).map((p) => ({ ...p, marks: Number(p.marks), branches: all.filter((c) => c.parentId === p.id).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ ...c, marks: Number(c.marks) })) }));
  return { ...exam, sections };
}

async function ownedQuestion(userId: string, questionId: string) {
  const q = await db.examQuestion.findFirst({
    where: { id: questionId, deletedAt: null, parentId: { not: null }, examModel: { exam: { ownerId: userId, deletedAt: null } } },
    include: { examModel: { include: { exam: { include: { subject: true, grade: true } } } } },
  });
  return q;
}

/** يعيد مجموع درجات القسم والامتحان بعد تعديل/حذف */
async function recomputeMarks(tx: Prisma.TransactionClient, examId: string, parentId: string) {
  const kids = await tx.examQuestion.findMany({ where: { parentId, deletedAt: null }, select: { marks: true } });
  await tx.examQuestion.update({ where: { id: parentId }, data: { marks: kids.reduce((n, k) => n + Number(k.marks), 0) } });
  const all = await tx.examQuestion.findMany({ where: { examModel: { examId }, parentId: { not: null }, deletedAt: null }, select: { marks: true } });
  await tx.exam.update({ where: { id: examId }, data: { totalMarks: Math.round(all.reduce((n, k) => n + Number(k.marks), 0)) } });
}

export async function editQuestion(userId: string, questionId: string, patch: { prompt?: string; options?: string[] | null; answer?: string; marks?: number }) {
  const q = await ownedQuestion(userId, questionId);
  if (!q) return fail("NOT_FOUND");
  // اختيار من متعدد: الجواب النهائي يجب أن يكون أحد الخيارات النهائية (سواء عُدّل أحدهما أو كلاهما)
  if (q.type === "MCQ" && (patch.options !== undefined || patch.answer !== undefined)) {
    const opts = patch.options !== undefined ? patch.options : ((q.options as string[] | null) ?? null);
    const ans = patch.answer ?? q.answer ?? "";
    if (!opts || opts.length < 2 || !opts.includes(ans)) return fail("ANSWER_NOT_IN_OPTIONS");
  }
  await db.$transaction(async (tx) => {
    await tx.examQuestionRevision.create({ data: { questionId: q.id, version: q.version + 1, reason: "EDIT", snapshot: snapshot(q), editedById: userId } });
    await tx.examQuestion.update({
      where: { id: q.id },
      data: {
        version: q.version + 1,
        ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
        ...(patch.options !== undefined ? { options: patch.options ?? Prisma.DbNull } : {}),
        ...(patch.answer !== undefined ? { answer: patch.answer } : {}),
        ...(patch.marks !== undefined ? { marks: patch.marks } : {}),
      },
    });
    if (patch.marks !== undefined) await recomputeMarks(tx, q.examModel.examId, q.parentId!);
  });
  return { ok: true as const };
}

export async function deleteQuestion(userId: string, questionId: string) {
  const q = await ownedQuestion(userId, questionId);
  if (!q) return fail("NOT_FOUND");
  await db.$transaction(async (tx) => {
    await tx.examQuestion.update({ where: { id: q.id }, data: { deletedAt: new Date() } });
    await recomputeMarks(tx, q.examModel.examId, q.parentId!);
  });
  return { ok: true as const };
}

/** يستبدل سؤالاً واحداً بسؤال جديد من النوع نفسه ومن المصدر نفسه، دون تكرار أسئلة القسم */
export async function regenerateQuestion(userId: string, questionId: string) {
  const q = await ownedQuestion(userId, questionId);
  if (!q || !q.type) return fail("NOT_FOUND");
  const exam = q.examModel.exam;
  const settings = exam.settings as { pages?: number[]; bookId?: string };
  const book = settings.bookId ? await db.uploadedBook.findUnique({ where: { id: settings.bookId } }) : null;
  if (!book || !settings.pages?.length) return fail("SOURCE_MISSING");
  const siblings = await db.examQuestion.findMany({ where: { parentId: q.parentId, deletedAt: null }, select: { prompt: true } });
  const lang = exam.language === "EN" ? "EN" : "AR";
  const ctx: Ctx = { subject: lang === "EN" ? exam.subject.nameEn : exam.subject.nameAr, grade: lang === "EN" ? exam.grade.nameEn : exam.grade.nameAr, lang, useLatinSymbols: exam.subject.useLatinSymbols, family: exam.subject.family, samples: await pickSamples(exam.subjectId, exam.gradeId) };
  const section: Section = { type: q.type as GenType, count: 1, marksEach: Number(q.marks) };
  try {
    const src = await loadSource(book.id, book.storageKey, settings.pages);
    const { bySection } = await askModel(ctx, exam.difficulty, [section], src, siblings.map((s) => s.prompt));
    const nq = bySection[0][0];
    if (!nq) return fail("NO_VALID_QUESTIONS");
    await db.$transaction(async (tx) => {
      await tx.examQuestionRevision.create({ data: { questionId: q.id, version: q.version + 1, reason: "REGENERATE", snapshot: snapshot(q), editedById: userId } });
      await tx.examQuestion.update({ where: { id: q.id }, data: { version: q.version + 1, prompt: nq.prompt, options: nq.options ?? Prisma.DbNull, answer: nq.answer, sourcePages: nq.sourcePages, difficulty: nq.difficulty, cognitiveLevel: nq.cognitiveLevel } });
    });
    return { ok: true as const };
  } catch (e) {
    return fail(e instanceof AiError && e.code === "QUOTA" ? "AI_QUOTA" : e instanceof AiError && e.code === "NO_KEY" ? "AI_UNAVAILABLE" : "AI_FAILED");
  }
}

/**
 * التراجع عن آخر تغيير: مراجعة النسخة الحالية (version = q.version) تحمل حالة السؤال قبلها، فتُسترجع.
 * التراجع نفسه تغيير جديد (RESTORE)، فتراجع ثانٍ يعيد ما قبله (تبديل بين آخر حالتين).
 */
export async function undoQuestion(userId: string, questionId: string) {
  const q = await ownedQuestion(userId, questionId);
  if (!q) return fail("NOT_FOUND");
  const prev = await db.examQuestionRevision.findFirst({ where: { questionId: q.id, version: q.version, reason: { not: "CREATE" } } });
  if (!prev) return fail("NOTHING_TO_UNDO");
  const s = prev.snapshot as { prompt: string; options: string[] | null; answer: string | null; marks: string; sourcePages: number[] };
  await db.$transaction(async (tx) => {
    await tx.examQuestionRevision.create({ data: { questionId: q.id, version: q.version + 1, reason: "RESTORE", snapshot: snapshot(q), editedById: userId } });
    await tx.examQuestion.update({ where: { id: q.id }, data: { version: q.version + 1, prompt: s.prompt, options: s.options ?? Prisma.DbNull, answer: s.answer, marks: Number(s.marks), sourcePages: s.sourcePages } });
    await recomputeMarks(tx, q.examModel.examId, q.parentId!);
  });
  return { ok: true as const };
}

export async function deleteExam(userId: string, id: string) {
  const r = await db.exam.updateMany({ where: { id, ownerId: userId, deletedAt: null }, data: { deletedAt: new Date() } });
  return r.count === 1 ? { ok: true as const } : fail("NOT_FOUND");
}

// ───────────────────────── تحرير الامتحان كاملاً ─────────────────────────

const roundMarks = (n: number) => Math.round(n * 2) / 2;

async function ownedExam(userId: string, examId: string) {
  return db.exam.findFirst({ where: { id: examId, ownerId: userId, deletedAt: null }, include: { subject: true, grade: true, models: { take: 1 } } });
}

async function ownedSection(userId: string, sectionId: string) {
  return db.examQuestion.findFirst({
    where: { id: sectionId, parentId: null, deletedAt: null, examModel: { exam: { ownerId: userId, deletedAt: null } } },
    include: { examModel: { include: { exam: { include: { subject: true, grade: true } } } } },
  });
}

/** يعيد حساب درجة كل قسم (مجموع فروعه) والدرجة الكلية */
async function recomputeExam(tx: Prisma.TransactionClient, examId: string) {
  const parents = await tx.examQuestion.findMany({ where: { examModel: { examId }, parentId: null, deletedAt: null }, select: { id: true } });
  let total = 0;
  for (const p of parents) {
    const kids = await tx.examQuestion.findMany({ where: { parentId: p.id, deletedAt: null }, select: { marks: true } });
    const m = kids.reduce((n, k) => n + Number(k.marks), 0);
    total += m;
    await tx.examQuestion.update({ where: { id: p.id }, data: { marks: m } });
  }
  await tx.exam.update({ where: { id: examId }, data: { totalMarks: Math.round(total) } });
}

export async function updateExamMeta(userId: string, examId: string, patch: { title?: string; durationMinutes?: number | null }) {
  const e = await ownedExam(userId, examId);
  if (!e) return fail("NOT_FOUND");
  await db.exam.update({ where: { id: e.id }, data: { ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.durationMinutes !== undefined ? { durationMinutes: patch.durationMinutes } : {}) } });
  return { ok: true as const };
}

/** توزيع الدرجة الكلية على الأقسام والفروع (ذكي أو متساوٍ) */
export async function distributeExamMarks(userId: string, examId: string, total: number, mode: "smart" | "equal") {
  const e = await ownedExam(userId, examId);
  if (!e?.models[0]) return fail("NOT_FOUND");
  const rows = await db.examQuestion.findMany({ where: { examModelId: e.models[0].id, deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, parentId: true, type: true, difficulty: true } });
  const sections: MarkSection[] = rows.filter((r) => !r.parentId).map((p) => ({
    id: p.id, type: (p.type ?? "ESSAY") as MarkSection["type"],
    items: rows.filter((c) => c.parentId === p.id).map((c) => ({ id: c.id, difficulty: c.difficulty === "MIXED" ? null : (c.difficulty as "EASY" | "MEDIUM" | "HARD" | null) })),
  }));
  const plan = distributeMarks(sections, total, mode);
  if ("error" in plan) return { ok: false as const, code: plan.error, detail: String(plan.min) };
  await db.$transaction(async (tx) => {
    for (const s of plan.sections) {
      await tx.examQuestion.update({ where: { id: s.id }, data: { marks: s.marks } });
      for (const it of s.items) await tx.examQuestion.update({ where: { id: it.id }, data: { marks: it.marks } });
    }
    await tx.exam.update({ where: { id: e.id }, data: { totalMarks: plan.total } });
  });
  return { ok: true as const, total: plan.total };
}

/** ترتيب الأقسام: ids كل الأقسام الحالية بالترتيب الجديد */
export async function reorderSections(userId: string, examId: string, ids: string[]) {
  const e = await ownedExam(userId, examId);
  if (!e?.models[0]) return fail("NOT_FOUND");
  const cur = await db.examQuestion.findMany({ where: { examModelId: e.models[0].id, parentId: null, deletedAt: null }, select: { id: true } });
  if (cur.length !== ids.length || cur.some((c) => !ids.includes(c.id))) return fail("BAD_ORDER");
  await db.$transaction(ids.map((id, i) => db.examQuestion.update({ where: { id }, data: { sortOrder: i + 1 } })));
  return { ok: true as const };
}

/** ترتيب فروع قسم: ids كل فروعه بالترتيب الجديد */
export async function reorderQuestions(userId: string, sectionId: string, ids: string[]) {
  const s = await ownedSection(userId, sectionId);
  if (!s) return fail("NOT_FOUND");
  const cur = await db.examQuestion.findMany({ where: { parentId: s.id, deletedAt: null }, select: { id: true } });
  if (cur.length !== ids.length || cur.some((c) => !ids.includes(c.id))) return fail("BAD_ORDER");
  await db.$transaction(ids.map((id, i) => db.examQuestion.update({ where: { id }, data: { sortOrder: i + 1 } })));
  return { ok: true as const };
}

/** تعديل القسم: نص التعليمة، و/أو درجته (تُقسم على فروعه بالتساوي، بأنصاف عند الحاجة) */
export async function updateSection(userId: string, sectionId: string, patch: { instruction?: string; marks?: number }) {
  const s = await ownedSection(userId, sectionId);
  if (!s) return fail("NOT_FOUND");
  const lang = s.examModel.exam.language === "EN" ? "EN" : "AR";
  await db.$transaction(async (tx) => {
    if (patch.instruction !== undefined) {
      const txt = lang === "AR" ? normalizeHonorifics(patch.instruction) : patch.instruction;
      await tx.examQuestion.update({ where: { id: s.id }, data: { instruction: txt, prompt: txt } });
    }
    if (patch.marks !== undefined) {
      const kids = await tx.examQuestion.findMany({ where: { parentId: s.id, deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true } });
      if (kids.length) {
        const each = roundMarks(patch.marks / kids.length);
        // آخر فرع يأخذ الفرق حتى يطابق المجموع ما كتبه المدرس
        for (const [i, k] of kids.entries()) await tx.examQuestion.update({ where: { id: k.id }, data: { marks: i === kids.length - 1 ? roundMarks(patch.marks - each * (kids.length - 1)) : each } });
      }
    }
    await recomputeExam(tx, s.examModel.examId);
  });
  return { ok: true as const };
}

export async function deleteSection(userId: string, sectionId: string) {
  const s = await ownedSection(userId, sectionId);
  if (!s) return fail("NOT_FOUND");
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.examQuestion.updateMany({ where: { OR: [{ id: s.id }, { parentId: s.id }] }, data: { deletedAt: now } });
    await recomputeExam(tx, s.examModel.examId);
  });
  return { ok: true as const };
}

/** سؤال يكتبه المدرس بنفسه داخل قسم */
export async function addManualQuestion(userId: string, sectionId: string, q: { prompt: string; answer: string; options?: string[] | null; marks?: number }) {
  const s = await ownedSection(userId, sectionId);
  if (!s || !s.type) return fail("NOT_FOUND");
  if (s.type === "MCQ" && (!q.options || q.options.length < 2 || !q.options.includes(q.answer))) return fail("ANSWER_NOT_IN_OPTIONS");
  const lang = s.examModel.exam.language === "EN" ? "EN" : "AR";
  const p = polishQuestion(s.type as GenType, lang, { prompt: q.prompt, answer: q.answer, options: s.type === "MCQ" ? q.options ?? null : null });
  const last = await db.examQuestion.findFirst({ where: { parentId: s.id, deletedAt: null }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true, marks: true } });
  await db.$transaction(async (tx) => {
    const c = await tx.examQuestion.create({
      data: { examModelId: s.examModelId, parentId: s.id, sortOrder: (last?.sortOrder ?? 0) + 1, type: s.type, prompt: p.prompt, options: p.options ?? Prisma.DbNull, answer: p.answer, marks: q.marks ?? Number(last?.marks ?? 1), sourcePages: [] },
    });
    await tx.examQuestionRevision.create({ data: { questionId: c.id, version: 1, reason: "CREATE", snapshot: snapshot(c), editedById: userId } });
    await recomputeExam(tx, s.examModel.examId);
  });
  return { ok: true as const };
}

/** مصدر الامتحان وسياقه لتوليد إضافي */
async function genContext(exam: { language: string; settings: unknown; difficulty: CreateExamInput["difficulty"]; subjectId: string; gradeId: string; subject: { nameAr: string; nameEn: string; useLatinSymbols: boolean; family: string }; grade: { nameAr: string; nameEn: string } }) {
  const settings = exam.settings as { pages?: number[]; bookId?: string };
  const book = settings.bookId ? await db.uploadedBook.findUnique({ where: { id: settings.bookId } }) : null;
  if (!book || !settings.pages?.length) return null;
  const lang: "AR" | "EN" = exam.language === "EN" ? "EN" : "AR";
  const ctx: Ctx = { subject: lang === "EN" ? exam.subject.nameEn : exam.subject.nameAr, grade: lang === "EN" ? exam.grade.nameEn : exam.grade.nameAr, lang, useLatinSymbols: exam.subject.useLatinSymbols, family: exam.subject.family, samples: await pickSamples(exam.subjectId, exam.gradeId) };
  return { book, pages: settings.pages, ctx, lang };
}

const aiFail = (e: unknown) => fail(e instanceof AiError && e.code === "QUOTA" ? "AI_QUOTA" : e instanceof AiError && e.code === "NO_KEY" ? "AI_UNAVAILABLE" : "AI_FAILED");

/** يولّد فروعاً إضافية في قسم قائم (لا تكرر الموجود) */
export async function generateMore(userId: string, sectionId: string, count: number) {
  const s = await ownedSection(userId, sectionId);
  if (!s || !s.type || s.type === "DIAGRAM") return fail("NOT_FOUND");
  const g = await genContext(s.examModel.exam);
  if (!g) return fail("SOURCE_MISSING");
  const siblings = await db.examQuestion.findMany({ where: { parentId: s.id, deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { prompt: true, sortOrder: true, marks: true } });
  const each = Number(siblings.at(-1)?.marks ?? 1);
  try {
    const src = await loadSource(g.book.id, g.book.storageKey, g.pages);
    const sec: Section = { type: s.type as GenType, count, marksEach: each };
    const { bySection } = await askModel(g.ctx, s.examModel.exam.difficulty, [sec], src, siblings.map((x) => x.prompt));
    if (bySection[0].length === 0) return fail("NO_VALID_QUESTIONS");
    await db.$transaction(async (tx) => {
      let order = siblings.at(-1)?.sortOrder ?? 0;
      for (const q of bySection[0]) await createChild(tx, s.examModelId, s.id, ++order, sec, q, s.chapterId, userId);
      await recomputeExam(tx, s.examModel.examId);
    });
    return { ok: true as const, made: bySection[0].length };
  } catch (e) {
    return aiFail(e);
  }
}

/** قسم جديد بنوع آخر يُولَّد من مصدر الامتحان نفسه */
export async function addSection(userId: string, examId: string, input: Section) {
  const e = await ownedExam(userId, examId);
  if (!e?.models[0]) return fail("NOT_FOUND");
  if (e.subject.questionTypes.length && !e.subject.questionTypes.includes(input.type)) return fail("TYPE_NOT_ALLOWED");
  const existing = await db.examQuestion.findFirst({ where: { examModelId: e.models[0].id, parentId: null, deletedAt: null, type: input.type } });
  if (existing) return fail("DUPLICATE_SECTION");
  const g = await genContext(e);
  if (!g) return fail("SOURCE_MISSING");
  try {
    const src = await loadSource(g.book.id, g.book.storageKey, g.pages);
    const { bySection, instructions } = await askModel(g.ctx, e.difficulty, [input], src);
    if (bySection[0].length === 0) return fail("NO_VALID_QUESTIONS");
    const last = await db.examQuestion.findFirst({ where: { examModelId: e.models[0].id, parentId: null, deletedAt: null }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    await db.$transaction(async (tx) => {
      const inst = instructions[0];
      const parent = await tx.examQuestion.create({ data: { examModelId: e.models[0].id, sortOrder: (last?.sortOrder ?? 0) + 1, type: input.type, instruction: inst, prompt: inst, marks: 0, sourcePages: [] } });
      for (const [j, q] of bySection[0].entries()) await createChild(tx, e.models[0].id, parent.id, j + 1, input, q, null, userId);
      await recomputeExam(tx, e.id);
    });
    return { ok: true as const, made: bySection[0].length };
  } catch (err) {
    return aiFail(err);
  }
}


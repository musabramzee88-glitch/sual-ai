import "server-only";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { AiError, currentModel, geminiJson } from "../ai/gemini";
import { renderPagesJpeg } from "../books/page-image";
import { fileOf } from "../books/service";
import {
  buildPrompt, expandRanges, instructionFor, pickImagePages, RESPONSE_SCHEMA, sortIntoSections,
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

type Ctx = { subject: string; grade: string; lang: "AR" | "EN"; useLatinSymbols: boolean };

async function askModel(ctx: Ctx, difficulty: CreateExamInput["difficulty"], sections: Section[], src: Awaited<ReturnType<typeof loadSource>>, avoid?: string[]) {
  const prompt = buildPrompt({ ...ctx, difficulty, sections, pages: src.pages, avoid });
  const r = await geminiJson<{ questions?: RawQuestion[] }>({ prompt, images: src.images, schema: RESPONSE_SCHEMA, maxOutputTokens: 16_384 });
  const allowed = new Set(src.pages.map((p) => p.pageNumber));
  return sortIntoSections(r.questions ?? [], sections, allowed, ctx.lang);
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
  const ctx: Ctx = { subject: lang === "EN" ? cur.subject.nameEn : cur.subject.nameAr, grade: lang === "EN" ? cur.grade.nameEn : cur.grade.nameAr, lang, useLatinSymbols: cur.subject.useLatinSymbols };
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
    const { bySection, dropped } = await askModel(ctx, input.difficulty, input.sections, src);
    const made = bySection.reduce((n, s) => n + s.length, 0);
    if (made === 0) throw new AiError("BAD_RESPONSE", "NO_VALID_QUESTIONS");

    await db.$transaction(async (tx) => {
      const model = await tx.examModel.create({ data: { examId: exam.id, label: "A" } });
      for (const [i, s] of input.sections.entries()) {
        const qs = bySection[i];
        if (qs.length === 0) continue;
        const parent = await tx.examQuestion.create({
          data: { examModelId: model.id, sortOrder: i + 1, type: s.type, instruction: instructionFor(s.type, lang), prompt: instructionFor(s.type, lang), marks: s.marksEach * qs.length, sourcePages: [], chapterId },
        });
        for (const [j, q] of qs.entries()) await createChild(tx, model.id, parent.id, j + 1, s, q, chapterId, userId);
      }
      const realMarks = input.sections.reduce((n, s, i) => n + s.marksEach * bySection[i].length, 0);
      await tx.exam.update({ where: { id: exam.id }, data: { status: "READY", totalMarks: realMarks, settings: { sections: input.sections, pages: pageNumbers, truncated, bookId: book.id, imagePages: src.pages.filter((p) => p.asImage).map((p) => p.pageNumber), ocrPages: src.pages.filter((p) => p.isOcr).map((p) => p.pageNumber), dropped, made } as Prisma.InputJsonValue } });
      await tx.examGenerationJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", finishedAt: new Date(), aiModel: currentModel() } });
    });
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
  const all = exam.models[0]?.questions ?? [];
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
  if (q.type === "MCQ" && patch.options !== undefined && patch.options !== null && patch.answer !== undefined && !patch.options.includes(patch.answer)) return fail("ANSWER_NOT_IN_OPTIONS");
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
  const ctx: Ctx = { subject: lang === "EN" ? exam.subject.nameEn : exam.subject.nameAr, grade: lang === "EN" ? exam.grade.nameEn : exam.grade.nameAr, lang, useLatinSymbols: exam.subject.useLatinSymbols };
  const section: Section = { type: q.type as GenType, count: 1, marksEach: Number(q.marks) };
  try {
    const src = await loadSource(book.id, book.storageKey, settings.pages);
    const { bySection } = await askModel(ctx, exam.difficulty, [section], src, siblings.map((s) => s.prompt));
    const nq = bySection[0][0];
    if (!nq) return fail("AI_FAILED");
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

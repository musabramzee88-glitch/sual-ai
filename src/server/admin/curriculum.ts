import "server-only";
import { z } from "zod";
import { Prisma, QuestionType, SubjectFamily } from "@prisma/client";
import { db } from "../db";
import { codeSchema } from "../http";
import { audit, type Actor } from "./audit";

/**
 * إدارة بيانات المناهج من لوحة الإدارة (صلاحية MANAGE_CURRICULUM).
 * - الرمز (code) ثابت بعد الإنشاء لأنه مرجع في الـ API والروابط.
 * - لا حذف نهائي للبيانات المرجعية: التعطيل (isActive=false) يخفيها من الواجهة العامة دون كسر الامتحانات القائمة.
 */
type Fail<C extends string> = { ok: false; code: C };
const fail = <C extends string>(code: C): Fail<C> => ({ ok: false, code });
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const name = z.string().trim().min(1).max(120);
const base = { nameAr: name, nameEn: name, sortOrder: z.number().int().min(0).max(10_000).optional() };
const patchBase = { nameAr: name.optional(), nameEn: name.optional(), sortOrder: z.number().int().min(0).max(10_000).optional(), isActive: z.boolean().optional() };
const codes = z.array(codeSchema).max(50);

export const schemas = {
  stages: { create: z.object({ code: codeSchema, ...base }), update: z.object(patchBase) },
  grades: { create: z.object({ code: codeSchema, stageCode: codeSchema, ...base }), update: z.object(patchBase) },
  tracks: {
    create: z.object({ code: codeSchema, ...base, defaultLanguage: z.enum(["AR", "EN"]).default("AR"), gradeCodes: codes.default([]) }),
    update: z.object({ ...patchBase, descriptionAr: z.string().trim().max(500).nullable().optional(), descriptionEn: z.string().trim().max(500).nullable().optional(), defaultLanguage: z.enum(["AR", "EN"]).optional(), gradeCodes: codes.optional() }),
  },
  branches: {
    create: z.object({ code: codeSchema, ...base, gradeCodes: codes.default([]) }),
    update: z.object({ ...patchBase, gradeCodes: codes.optional() }),
  },
  subjects: {
    create: z.object({ code: codeSchema, ...base, family: z.nativeEnum(SubjectFamily), questionTypes: z.array(z.nativeEnum(QuestionType)).min(1).max(20), useLatinSymbols: z.boolean().default(false) }),
    update: z.object({ ...patchBase, family: z.nativeEnum(SubjectFamily).optional(), questionTypes: z.array(z.nativeEnum(QuestionType)).min(1).max(20).optional(), useLatinSymbols: z.boolean().optional() }),
  },
  years: {
    create: z.object({ label: z.string().regex(/^\d{4}-\d{4}$/), startsOn: z.coerce.date(), endsOn: z.coerce.date() }).refine((v) => v.endsOn > v.startsOn, { message: "INVALID_DATE" }),
    update: z.object({ isCurrent: z.literal(true) }),
  },
  curricula: {
    create: z.object({
      trackCode: codeSchema, gradeCode: codeSchema, branchCode: codeSchema.nullable().optional(), subjectCode: codeSchema, yearLabel: z.string().regex(/^\d{4}-\d{4}$/),
      language: z.enum(["AR", "EN"]), kind: z.enum(["TEXTBOOK", "EXERCISES", "ACTIVITY"]).default("TEXTBOOK"), title: z.string().trim().min(2).max(200), edition: z.string().trim().max(80).nullable().optional(),
    }),
    update: z.object({ title: z.string().trim().min(2).max(200).optional(), edition: z.string().trim().max(80).nullable().optional(), isActive: z.boolean().optional() }),
  },
} as const;
export type Kind = keyof typeof schemas;
export const KINDS = Object.keys(schemas) as Kind[];

async function gradeIds(tx: Prisma.TransactionClient, gradeCodes: string[]) {
  const rows = await tx.grade.findMany({ where: { code: { in: gradeCodes } }, select: { id: true, code: true } });
  return rows.length === new Set(gradeCodes).size ? rows.map((r) => r.id) : null;
}

/** إنشاء عنصر مرجعي */
export async function createEntity(actor: Actor, kind: Kind, raw: unknown) {
  const parsed = schemas[kind].create.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION_ERROR" as const);
  const input = parsed.data as Record<string, unknown>;
  try {
    return await db.$transaction(async (tx) => {
      let id: string;
      switch (kind) {
        case "stages": {
          const i = input as z.infer<typeof schemas.stages.create>;
          id = (await tx.educationStage.create({ data: i })).id;
          break;
        }
        case "grades": {
          const { stageCode, ...i } = input as z.infer<typeof schemas.grades.create>;
          const stage = await tx.educationStage.findUnique({ where: { code: stageCode } });
          if (!stage) return fail("STAGE_NOT_FOUND" as const);
          id = (await tx.grade.create({ data: { ...i, stageId: stage.id } })).id;
          break;
        }
        case "tracks": {
          const { gradeCodes, ...i } = input as z.infer<typeof schemas.tracks.create>;
          const ids = await gradeIds(tx, gradeCodes);
          if (!ids) return fail("GRADE_NOT_FOUND" as const);
          id = (await tx.curriculumTrack.create({ data: { ...i, grades: { create: ids.map((gradeId) => ({ gradeId })) } } })).id;
          break;
        }
        case "branches": {
          const { gradeCodes, ...i } = input as z.infer<typeof schemas.branches.create>;
          const ids = await gradeIds(tx, gradeCodes);
          if (!ids) return fail("GRADE_NOT_FOUND" as const);
          id = (await tx.studyBranch.create({ data: { ...i, grades: { create: ids.map((gradeId) => ({ gradeId })) } } })).id;
          break;
        }
        case "subjects": {
          const i = input as z.infer<typeof schemas.subjects.create>;
          id = (await tx.subject.create({ data: i })).id;
          break;
        }
        case "years": {
          const i = input as z.infer<typeof schemas.years.create>;
          id = (await tx.academicYear.create({ data: i })).id;
          break;
        }
        case "curricula": {
          const i = input as z.infer<typeof schemas.curricula.create>;
          const [track, grade, subject, year, branch] = await Promise.all([
            tx.curriculumTrack.findUnique({ where: { code: i.trackCode }, include: { grades: true } }),
            tx.grade.findUnique({ where: { code: i.gradeCode }, include: { branches: true } }),
            tx.subject.findUnique({ where: { code: i.subjectCode } }),
            tx.academicYear.findUnique({ where: { label: i.yearLabel } }),
            i.branchCode ? tx.studyBranch.findUnique({ where: { code: i.branchCode } }) : Promise.resolve(null),
          ]);
          if (!track || !grade || !subject || !year || (i.branchCode && !branch)) return fail("REFERENCE_NOT_FOUND" as const);
          // اتساق المنهج: المسار متاح لهذا الصف، والفرع (إن وُجد) يتبع الصف
          if (!track.grades.some((g) => g.gradeId === grade.id)) return fail("TRACK_NOT_FOR_GRADE" as const);
          if (branch && !grade.branches.some((b) => b.branchId === branch.id)) return fail("BRANCH_NOT_FOR_GRADE" as const);
          // فرادة يدوية لأن PostgreSQL يعامل NULL (الفرع/الطبعة) كقيم مختلفة في القيد المركّب
          const dup = await tx.curriculum.findFirst({ where: { trackId: track.id, gradeId: grade.id, branchId: branch?.id ?? null, subjectId: subject.id, academicYearId: year.id, language: i.language, kind: i.kind, edition: i.edition ?? null } });
          if (dup) return fail("DUPLICATE" as const);
          id = (await tx.curriculum.create({
            data: { trackId: track.id, gradeId: grade.id, branchId: branch?.id ?? null, subjectId: subject.id, academicYearId: year.id, language: i.language, kind: i.kind, title: i.title, edition: i.edition ?? null },
          })).id;
          break;
        }
      }
      await audit(tx, actor, { action: `curriculum.${kind}.create`, targetType: kind, targetId: id, after: input as Prisma.InputJsonValue });
      return { ok: true as const, id };
    });
  } catch (e) {
    if (isUnique(e)) return fail("DUPLICATE" as const);
    throw e;
  }
}

/** تعديل عنصر مرجعي (الرمز ثابت) */
export async function updateEntity(actor: Actor, kind: Kind, id: string, raw: unknown) {
  const parsed = schemas[kind].update.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION_ERROR" as const);
  const input = parsed.data as Record<string, unknown>;
  try {
    return await db.$transaction(async (tx) => {
      let before: unknown;
      switch (kind) {
        case "stages":
          before = await tx.educationStage.findUnique({ where: { id } });
          if (!before) return fail("NOT_FOUND" as const);
          await tx.educationStage.update({ where: { id }, data: input });
          break;
        case "grades":
          before = await tx.grade.findUnique({ where: { id } });
          if (!before) return fail("NOT_FOUND" as const);
          await tx.grade.update({ where: { id }, data: input });
          break;
        case "tracks": {
          const { gradeCodes, ...i } = input as z.infer<typeof schemas.tracks.update>;
          before = await tx.curriculumTrack.findUnique({ where: { id }, include: { grades: { select: { grade: { select: { code: true } } } } } });
          if (!before) return fail("NOT_FOUND" as const);
          await tx.curriculumTrack.update({ where: { id }, data: i });
          if (gradeCodes) {
            const ids = await gradeIds(tx, gradeCodes);
            if (!ids) return fail("GRADE_NOT_FOUND" as const);
            await tx.trackGrade.deleteMany({ where: { trackId: id } });
            await tx.trackGrade.createMany({ data: ids.map((gradeId) => ({ trackId: id, gradeId })) });
          }
          break;
        }
        case "branches": {
          const { gradeCodes, ...i } = input as z.infer<typeof schemas.branches.update>;
          before = await tx.studyBranch.findUnique({ where: { id }, include: { grades: { select: { grade: { select: { code: true } } } } } });
          if (!before) return fail("NOT_FOUND" as const);
          await tx.studyBranch.update({ where: { id }, data: i });
          if (gradeCodes) {
            const ids = await gradeIds(tx, gradeCodes);
            if (!ids) return fail("GRADE_NOT_FOUND" as const);
            await tx.gradeBranch.deleteMany({ where: { branchId: id } });
            await tx.gradeBranch.createMany({ data: ids.map((gradeId) => ({ branchId: id, gradeId })) });
          }
          break;
        }
        case "subjects":
          before = await tx.subject.findUnique({ where: { id } });
          if (!before) return fail("NOT_FOUND" as const);
          await tx.subject.update({ where: { id }, data: input });
          break;
        case "years":
          // سنة حالية واحدة فقط (فهرس جزئي): نلغي الحالية أولاً ثم نعيّن الجديدة
          before = await tx.academicYear.findUnique({ where: { id } });
          if (!before) return fail("NOT_FOUND" as const);
          await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
          await tx.academicYear.update({ where: { id }, data: { isCurrent: true } });
          break;
        case "curricula":
          before = await tx.curriculum.findUnique({ where: { id } });
          if (!before) return fail("NOT_FOUND" as const);
          await tx.curriculum.update({ where: { id }, data: input });
          break;
      }
      await audit(tx, actor, { action: `curriculum.${kind}.update`, targetType: kind, targetId: id, before: JSON.parse(JSON.stringify(before)), after: input as Prisma.InputJsonValue });
      return { ok: true as const };
    });
  } catch (e) {
    if (isUnique(e)) return fail("DUPLICATE" as const);
    throw e;
  }
}

// ───────────────────────── فصول المنهج ─────────────────────────
const page = z.number().int().min(1).max(5000);
export const chaptersSchema = z.object({
  chapters: z.array(z.object({ id: z.string().min(10).max(40).optional(), title: z.string().trim().min(1).max(200), pageStart: page.nullable().optional(), pageEnd: page.nullable().optional() })
    .refine((c) => c.pageStart == null || c.pageEnd == null || c.pageEnd >= c.pageStart, { message: "INVALID_PAGES" })).max(200),
});

/**
 * يستبدل قائمة الفصول كاملة بالترتيب المُرسَل (إضافة/تعديل/حذف/إعادة ترتيب) في معاملة واحدة.
 * حذف فصل لا يحذف الأسئلة المرتبطة به (تُفصل عنه فقط).
 */
export async function replaceChapters(actor: Actor, curriculumId: string, input: z.infer<typeof chaptersSchema>) {
  return db.$transaction(async (tx) => {
    const cur = await tx.curriculum.findUnique({ where: { id: curriculumId }, include: { chapters: true } });
    if (!cur) return fail("NOT_FOUND" as const);
    const existing = new Map(cur.chapters.map((c) => [c.id, c]));
    if (input.chapters.some((c) => c.id && !existing.has(c.id))) return fail("CHAPTER_NOT_FOUND" as const);
    const keep = new Set(input.chapters.map((c) => c.id).filter(Boolean) as string[]);

    await tx.curriculumChapter.deleteMany({ where: { curriculumId, id: { notIn: [...keep] } } });
    // ترتيب مؤقت سالب لتفادي تعارض القيد الفريد (curriculumId, sortOrder) أثناء إعادة الترتيب
    for (const [i, id] of [...keep].entries()) await tx.curriculumChapter.update({ where: { id }, data: { sortOrder: -(i + 1) } });
    for (const [i, c] of input.chapters.entries()) {
      const data = { title: c.title, pageStart: c.pageStart ?? null, pageEnd: c.pageEnd ?? null, sortOrder: i + 1 };
      if (c.id) await tx.curriculumChapter.update({ where: { id: c.id }, data });
      else await tx.curriculumChapter.create({ data: { ...data, curriculumId } });
    }
    await audit(tx, actor, {
      action: "curriculum.chapters.replace", targetType: "curricula", targetId: curriculumId,
      before: cur.chapters.map((c) => ({ title: c.title, pageStart: c.pageStart, pageEnd: c.pageEnd })),
      after: input.chapters.map((c) => ({ title: c.title, pageStart: c.pageStart ?? null, pageEnd: c.pageEnd ?? null })),
    });
    return { ok: true as const };
  });
}

// ───────────────────────── قراءات اللوحة (تشمل المعطّل) ─────────────────────────
const order = [{ sortOrder: "asc" as const }];
export async function adminCurriculumData() {
  const [stages, grades, tracks, branches, subjects, years, curricula] = await Promise.all([
    db.educationStage.findMany({ orderBy: order }),
    db.grade.findMany({ orderBy: [{ stage: { sortOrder: "asc" } }, { sortOrder: "asc" }], include: { stage: { select: { code: true, nameAr: true, nameEn: true } } } }),
    db.curriculumTrack.findMany({ orderBy: order, include: { grades: { select: { grade: { select: { code: true } } } } } }),
    db.studyBranch.findMany({ orderBy: order, include: { grades: { select: { grade: { select: { code: true } } } } } }),
    db.subject.findMany({ orderBy: order }),
    db.academicYear.findMany({ orderBy: { startsOn: "desc" } }),
    db.curriculum.findMany({
      orderBy: [{ grade: { sortOrder: "asc" } }, { createdAt: "desc" }],
      include: { track: true, grade: true, branch: true, subject: true, academicYear: true, _count: { select: { chapters: true } } },
    }),
  ]);
  return { stages, grades, tracks, branches, subjects, years, curricula };
}

export const getCurriculumWithChapters = (id: string) =>
  db.curriculum.findUnique({ where: { id }, include: { track: true, grade: true, branch: true, subject: true, academicYear: true, chapters: { orderBy: { sortOrder: "asc" } } } });

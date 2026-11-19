import "server-only";
import { db } from "./db";

/**
 * قراءات المناهج العامة. كل الفلترة تتم في قاعدة البيانات:
 * الصفوف تُجلب دائماً عبر رمز المرحلة، فلا يمكن ظهور صف من مرحلة أخرى.
 */
const pick = { code: true, nameAr: true, nameEn: true } as const;

export function listStages() {
  return db.educationStage.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { ...pick, _count: { select: { grades: { where: { isActive: true } } } } },
  });
}

export function listTracks(gradeCode?: string) {
  return db.curriculumTrack.findMany({
    where: { isActive: true, ...(gradeCode && { grades: { some: { grade: { code: gradeCode, isActive: true } } } }) },
    orderBy: { sortOrder: "asc" },
    select: { ...pick, descriptionAr: true, descriptionEn: true, defaultLanguage: true },
  });
}

export function listGrades(stageCode: string, trackCode?: string) {
  return db.grade.findMany({
    where: {
      isActive: true,
      stage: { code: stageCode, isActive: true },
      ...(trackCode && { tracks: { some: { track: { code: trackCode, isActive: true } } } }),
    },
    orderBy: { sortOrder: "asc" },
    select: pick,
  });
}

export function listBranches(gradeCode: string) {
  return db.studyBranch.findMany({
    where: { isActive: true, grades: { some: { grade: { code: gradeCode } } } },
    orderBy: { sortOrder: "asc" },
    select: pick,
  });
}

export function listSubjects() {
  return db.subject.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { ...pick, family: true, questionTypes: true, useLatinSymbols: true },
  });
}

export function listGovernorates() {
  return db.governorate.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { ...pick, directorates: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: pick } },
  });
}

/**
 * المناهج المحددة (مسار + صف + مادة [+ فرع]) مع فصولها ونطاق صفحاتها — يحتاجها معالج إنشاء الامتحان.
 * منهج بلا فرع مشترك لكل فروع الصف.
 */
export function listCurricula(f: { gradeCode: string; trackCode: string; subjectCode?: string; branchCode?: string }) {
  return db.curriculum.findMany({
    where: {
      isActive: true,
      grade: { code: f.gradeCode, isActive: true },
      track: { code: f.trackCode, isActive: true },
      subject: f.subjectCode ? { code: f.subjectCode, isActive: true } : { isActive: true },
      ...(f.branchCode ? { OR: [{ branchId: null }, { branch: { code: f.branchCode } }] } : {}),
    },
    orderBy: [{ academicYear: { startsOn: "desc" } }, { subject: { sortOrder: "asc" } }, { kind: "asc" }, { title: "asc" }],
    select: {
      id: true, title: true, edition: true, language: true, kind: true,
      subject: { select: pick }, branch: { select: pick }, academicYear: { select: { label: true, isCurrent: true } },
      chapters: { orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true, title: true, pageStart: true, pageEnd: true } },
    },
  });
}

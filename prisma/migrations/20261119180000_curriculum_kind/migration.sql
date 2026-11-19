-- نوع الكتاب (كتاب الطالب / التمارين / النشاط) جزء من هوية المنهج:
-- كتابان لنفس الصف والمادة والسنة (مثل الرياضيات وتمارين الرياضيات) لم يكونا ممكنين.

-- CreateEnum
CREATE TYPE "CurriculumKind" AS ENUM ('TEXTBOOK', 'EXERCISES', 'ACTIVITY');

-- DropIndex
DROP INDEX "Curriculum_trackId_gradeId_branchId_subjectId_academicYearI_key";

-- AlterTable
ALTER TABLE "Curriculum" ADD COLUMN     "kind" "CurriculumKind" NOT NULL DEFAULT 'TEXTBOOK';

-- CreateIndex
CREATE UNIQUE INDEX "Curriculum_trackId_gradeId_branchId_subjectId_academicYearI_key" ON "Curriculum"("trackId", "gradeId", "branchId", "subjectId", "academicYearId", "language", "kind", "edition");

-- فهرس الفرادة التعبيري (يعامل NULL كقيمة) يشمل النوع الآن
DROP INDEX "Curriculum_identity_nulls_key";
CREATE UNIQUE INDEX "Curriculum_identity_nulls_key" ON "Curriculum" (
  "trackId", "gradeId", COALESCE("branchId", ''), "subjectId", "academicYearId", "language", "kind", COALESCE("edition", '')
);

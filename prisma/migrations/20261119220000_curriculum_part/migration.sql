-- الجزء (الأول/الثاني) جزء من هوية المنهج: كتابان بأجزاء لنفس الصف والمادة لهما ترقيم صفحات مستقل.
-- DropIndex
DROP INDEX "Curriculum_trackId_gradeId_branchId_subjectId_academicYearI_key";

-- AlterTable
ALTER TABLE "Curriculum" ADD COLUMN     "part" INTEGER NOT NULL DEFAULT 0;

-- CheckConstraint
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_part_check" CHECK ("part" >= 0 AND "part" <= 5);

-- CreateIndex
CREATE UNIQUE INDEX "Curriculum_trackId_gradeId_branchId_subjectId_academicYearI_key" ON "Curriculum"("trackId", "gradeId", "branchId", "subjectId", "academicYearId", "language", "kind", "part", "edition");

-- فهرس الفرادة التعبيري (يعامل NULL كقيمة) يشمل الجزء الآن
DROP INDEX "Curriculum_identity_nulls_key";
CREATE UNIQUE INDEX "Curriculum_identity_nulls_key" ON "Curriculum" (
  "trackId", "gradeId", COALESCE("branchId", ''), "subjectId", "academicYearId", "language", "kind", "part", COALESCE("edition", '')
);

-- AlterTable
ALTER TABLE "UploadedBook" ADD COLUMN     "autoLinked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "confirmedAt" TIMESTAMP(3);

-- الكتب المربوطة قبل هذه الميزة ربطها المستخدم بنفسه: تُعدّ مؤكَّدة ولا تُغرق قائمة المراجعة
UPDATE "UploadedBook" SET "confirmedAt" = now() WHERE "curriculumId" IS NOT NULL;

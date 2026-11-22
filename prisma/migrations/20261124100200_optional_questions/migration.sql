-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "firstRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sectionsToAnswer" INTEGER;

-- AlterTable
ALTER TABLE "ExamQuestion" ADD COLUMN     "answerCount" INTEGER;

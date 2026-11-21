-- CreateTable
CREATE TABLE "ExamSample" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "gradeId" TEXT,
    "title" TEXT NOT NULL,
    "fileName" TEXT,
    "text" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamSample_subjectId_gradeId_idx" ON "ExamSample"("subjectId", "gradeId");

-- AddForeignKey
ALTER TABLE "ExamSample" ADD CONSTRAINT "ExamSample_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSample" ADD CONSTRAINT "ExamSample_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


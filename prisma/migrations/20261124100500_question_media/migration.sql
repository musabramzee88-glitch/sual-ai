-- AlterEnum
ALTER TYPE "AssetKind" ADD VALUE 'QUESTION_IMAGE';

-- AlterTable
ALTER TABLE "ExamQuestion" ADD COLUMN     "imageAssetId" TEXT,
ADD COLUMN     "table" JSONB;

-- AddForeignKey
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "TemplateAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

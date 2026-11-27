-- نص القطعة الخارجية على السؤال الرئيس
ALTER TABLE "ExamQuestion" ADD COLUMN "passage" TEXT;
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_passage_len_check" CHECK ("passage" IS NULL OR char_length("passage") <= 4000);

-- مواد اللغة الإنكليزية تقبل النوع الجديد (لا يمسّ ما عدّلته الإدارة لغيرها)
UPDATE "Subject" SET "questionTypes" = array_append("questionTypes", 'UNSEEN_PASSAGE'::"QuestionType")
WHERE "family" = 'ENGLISH' AND cardinality("questionTypes") > 0 AND NOT ('UNSEEN_PASSAGE'::"QuestionType" = ANY("questionTypes"));

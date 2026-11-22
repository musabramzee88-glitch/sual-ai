-- التربية الإسلامية: النوع الجديد أولاً في قائمة أنواع المادة
UPDATE "Subject" SET "questionTypes" = array_prepend('SURAH_RANGE'::"QuestionType", "questionTypes")
WHERE "code" = 'ISLAMIC' AND NOT ('SURAH_RANGE'::"QuestionType" = ANY("questionTypes"));

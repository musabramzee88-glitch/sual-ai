-- يضيف «من القائل؟» لأنواع المواد التي تستعمله (دون حذف أي نوع اختاره المسؤول)
UPDATE "Subject" SET "questionTypes" = array_append("questionTypes", 'WHO_SAID'::"QuestionType"), "updatedAt" = now()
WHERE "code" IN ('ISLAMIC', 'READING', 'ARABIC', 'HISTORY') AND NOT ('WHO_SAID'::"QuestionType" = ANY("questionTypes"));

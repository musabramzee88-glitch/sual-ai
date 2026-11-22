-- عدد الأسئلة/الفروع المجاب عنها: موجب إن وُجد
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_sectionsToAnswer_positive" CHECK ("sectionsToAnswer" IS NULL OR "sectionsToAnswer" >= 1);
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_answerCount_positive" CHECK ("answerCount" IS NULL OR "answerCount" >= 1);

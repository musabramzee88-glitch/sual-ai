-- PostgreSQL يعامل NULL كقيمة مختلفة في القيد الفريد المركّب، فيسمح بتكرار منهج بلا فرع/طبعة.
-- هذا الفهرس يمنع التكرار فعلياً (Prisma لا يمثّل الفهارس التعبيرية، ويتركها كما هي).
CREATE UNIQUE INDEX "Curriculum_identity_nulls_key" ON "Curriculum" (
  "trackId", "gradeId", COALESCE("branchId", ''), "subjectId", "academicYearId", "language", COALESCE("edition", '')
);

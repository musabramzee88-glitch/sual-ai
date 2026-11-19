-- فهرس فرادة قديم (من الهجرة الأولى) لا يشمل نوع الكتاب فكان يمنع كتابين لنفس الصف والمادة (كتاب + تمارين).
-- الفرادة الصحيحة يفرضها الآن "Curriculum_identity_nulls_key" (يشمل kind) وقيد Prisma المركّب.
DROP INDEX IF EXISTS "Curriculum_identity_nullsafe_key";

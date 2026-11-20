import "server-only";
import { db } from "../db";
import { audit, type Actor } from "../admin/audit";
import { createEntity } from "../admin/curriculum";
import { languageOf, type BookGuess } from "./names";

export type Placement = { trackCode: string; gradeCode: string; subjectCode: string; kind: BookGuess["kind"]; part?: number };
export type PlaceResult = { ok: true; created: boolean; curriculumId: string } | { ok: false; code: string };

/** العنوان الافتراضي النظيف للمنهج (لا اسم ملف) */
const PART_AR = ["", "الجزء الأول", "الجزء الثاني", "الجزء الثالث", "الجزء الرابع", "الجزء الخامس"];
const titleOf = (kind: BookGuess["kind"], subject: string, grade: string, part: number) =>
  `${kind === "EXERCISES" ? "تمارين " : kind === "ACTIVITY" ? "نشاط " : ""}${subject}${part > 0 ? ` — ${PART_AR[part]}` : ""} — ${grade}`;

/**
 * يضع الكتاب في مكانه: يجد المنهج (مسار + صف + مادة + السنة الحالية + نوع الكتاب) أو ينشئه، ثم يربط الكتاب به.
 * - mode "auto": تعرّف النظام الواثق؛ لا يُنفَّذ إن كان الكتاب مربوطاً أصلاً (لا يتجاوز اختيار مستخدم)، ويبقى ينتظر المراجعة.
 * - mode "confirm": المستخدم راجعه وأكّد (أو صحّح) فيُعدّ مؤكَّداً.
 * الإنشاء يمر بـ createEntity (نفس التحقق والتدقيق)، والربط في معاملة مع سجل تدقيق.
 */
export async function placeBook(actor: Actor, bookId: string, p: Placement, mode: "auto" | "confirm"): Promise<PlaceResult> {
  const year = await db.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) return { ok: false, code: "NO_CURRENT_YEAR" };
  const [track, grade, subject, book] = await Promise.all([
    db.curriculumTrack.findUnique({ where: { code: p.trackCode } }),
    db.grade.findUnique({ where: { code: p.gradeCode } }),
    db.subject.findUnique({ where: { code: p.subjectCode } }),
    db.uploadedBook.findUnique({ where: { id: bookId }, select: { id: true, ownerId: true, curriculumId: true } }),
  ]);
  if (!track || !grade || !subject || !book) return { ok: false, code: "REFERENCE_NOT_FOUND" };
  if (book.ownerId !== null) return { ok: false, code: "FORBIDDEN" };
  if (mode === "auto" && book.curriculumId) return { ok: false, code: "ALREADY_LINKED" };

  const language = languageOf(subject.code);
  const part = p.part ?? 0;
  let cur = await db.curriculum.findFirst({
    where: { trackId: track.id, gradeId: grade.id, branchId: null, subjectId: subject.id, academicYearId: year.id, language, kind: p.kind, part, edition: null },
    select: { id: true },
  });
  let created = false;
  if (!cur) {
    const r = await createEntity(actor, "curricula", {
      trackCode: track.code, gradeCode: grade.code, subjectCode: subject.code, yearLabel: year.label, language, kind: p.kind, part,
      title: titleOf(p.kind, subject.nameAr, grade.nameAr, part),
    });
    if (!r.ok) return { ok: false, code: r.code };
    cur = { id: r.id };
    created = true;
  }
  const curriculumId = cur.id;
  // التلقائي لا يضع كتاباً في منهج فيه كتاب آخر (غالباً جزء ثانٍ): يبقى للمراجعة ليحدَّد الجزء
  if (mode === "auto" && !created && (await db.uploadedBook.count({ where: { curriculumId, id: { not: bookId } } })) > 0) return { ok: false, code: "OCCUPIED" };
  await db.$transaction(async (tx) => {
    await tx.uploadedBook.update({
      where: { id: bookId },
      data: { curriculumId, ...(mode === "auto" ? { autoLinked: true, confirmedAt: null } : { confirmedAt: new Date() }) },
    });
    await audit(tx, actor, {
      action: mode === "auto" ? "book.auto_link" : "book.confirm", targetType: "UploadedBook", targetId: bookId,
      before: { curriculumId: book.curriculumId }, after: { curriculumId, ...p },
    });
  });
  return { ok: true, created, curriculumId };
}

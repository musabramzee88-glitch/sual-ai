import "server-only";
import { z } from "zod";
import { db } from "../db";
import { codeSchema } from "../http";
import type { Actor } from "../admin/audit";
import { createEntity } from "../admin/curriculum";
import { guessFromName, languageOf, type BookGuess } from "./names";
import { linkBook } from "./service";

export const applySchema = z.object({
  trackCode: codeSchema,
  items: z.array(z.object({
    bookId: z.string().min(10).max(40),
    gradeCode: codeSchema,
    subjectCode: codeSchema,
    kind: z.enum(["TEXTBOOK", "EXERCISES", "ACTIVITY"]),
  })).min(1).max(100),
});

/** اقتراحات للكتب غير المربوطة: تخمين من الاسم فقط، والمستخدم يراجعه ويعدّله */
export async function proposeLinks() {
  const books = await db.uploadedBook.findMany({
    where: { ownerId: null, curriculumId: null },
    orderBy: { originalName: "asc" },
    select: { id: true, originalName: true, status: true, error: true },
  });
  return books.map((b) => ({ ...b, guess: guessFromName(b.originalName) as BookGuess }));
}

type ItemResult = { bookId: string; ok: boolean; created?: boolean; curriculumId?: string; code?: string };

/** العنوان الافتراضي النظيف للمنهج (لا اسم ملف) */
const titleOf = (kind: BookGuess["kind"], subject: string, grade: string) =>
  `${kind === "EXERCISES" ? "تمارين " : kind === "ACTIVITY" ? "نشاط " : ""}${subject} — ${grade}`;

/**
 * لكل كتاب: يجد المنهج (مسار + صف + مادة + السنة الحالية + نوع الكتاب) أو ينشئه، ثم يربط الكتاب به.
 * كل عنصر مستقل (فشل واحد لا يلغي الباقي) وكل عملية في سجل التدقيق عبر الخدمات الأصلية.
 */
export async function applyLinks(actor: Actor, input: z.infer<typeof applySchema>) {
  const year = await db.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) return { ok: false as const, code: "NO_CURRENT_YEAR" as const };
  const track = await db.curriculumTrack.findUnique({ where: { code: input.trackCode } });
  if (!track) return { ok: false as const, code: "REFERENCE_NOT_FOUND" as const };

  const results: ItemResult[] = [];
  for (const it of input.items) {
    const [grade, subject, book] = await Promise.all([
      db.grade.findUnique({ where: { code: it.gradeCode } }),
      db.subject.findUnique({ where: { code: it.subjectCode } }),
      db.uploadedBook.findUnique({ where: { id: it.bookId } }),
    ]);
    if (!grade || !subject || !book) { results.push({ bookId: it.bookId, ok: false, code: "REFERENCE_NOT_FOUND" }); continue; }
    if (book.ownerId !== null) { results.push({ bookId: it.bookId, ok: false, code: "FORBIDDEN" }); continue; }

    const language = languageOf(subject.code);
    let cur = await db.curriculum.findFirst({
      where: { trackId: track.id, gradeId: grade.id, branchId: null, subjectId: subject.id, academicYearId: year.id, language, kind: it.kind, edition: null },
      select: { id: true },
    });
    let created = false;
    if (!cur) {
      const r = await createEntity(actor, "curricula", {
        trackCode: track.code, gradeCode: grade.code, subjectCode: subject.code, yearLabel: year.label, language, kind: it.kind,
        title: titleOf(it.kind, subject.nameAr, grade.nameAr),
      });
      if (!r.ok) { results.push({ bookId: it.bookId, ok: false, code: r.code }); continue; }
      cur = { id: r.id };
      created = true;
    }
    const l = await linkBook(actor, it.bookId, cur.id);
    results.push(l.ok ? { bookId: it.bookId, ok: true, created, curriculumId: cur.id } : { bookId: it.bookId, ok: false, code: l.code });
  }
  return { ok: true as const, results };
}

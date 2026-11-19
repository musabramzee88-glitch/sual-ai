import "server-only";
import { z } from "zod";
import { db } from "../db";
import { codeSchema } from "../http";
import type { Actor } from "../admin/audit";
import { guessFromName, type BookGuess } from "./names";
import { placeBook } from "./placement";
import type { Detected } from "./service";

export const confirmSchema = z.object({
  items: z.array(z.object({
    bookId: z.string().min(10).max(40),
    trackCode: codeSchema,
    gradeCode: codeSchema,
    subjectCode: codeSchema,
    kind: z.enum(["TEXTBOOK", "EXERCISES", "ACTIVITY"]),
  })).min(1).max(200),
});

export type ReviewItem = {
  id: string; originalName: string; status: string; error: string | null; pageCount: number | null; textPageCount: number | null; processedPages: number;
  trackCode: string; gradeCode: string | null; subjectCode: string | null; kind: BookGuess["kind"];
  /** واثق: النظام يرجّح صحة الاقتراح (غلاف بعبارة صف صريحة، أو ربط تلقائي سابق) */
  sure: boolean; linked: boolean; autoLinked: boolean; evidence: string | null; source: string | null;
  /** ما زال يُقرأ/يُتعرَّف عليه */
  working: boolean;
};

/**
 * كتب تنتظر مراجعة المستخدم: كل كتاب لم يُؤكَّد بعد (مربوط تلقائياً أو غير مربوط).
 * المصدر الأول للاقتراح: منهجه الحالي، ثم محتوى الغلاف، ثم اسم الملف احتياطاً.
 */
export async function listReview(): Promise<ReviewItem[]> {
  const books = await db.uploadedBook.findMany({
    where: { ownerId: null, confirmedAt: null },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true, originalName: true, status: true, error: true, pageCount: true, textPageCount: true, processedPages: true, detected: true, autoLinked: true, curriculumId: true,
      curriculum: { select: { kind: true, grade: { select: { code: true } }, subject: { select: { code: true } }, track: { select: { code: true } } } },
    },
  });
  return books.map((b) => {
    const d = b.detected as Detected | null;
    const name = guessFromName(b.originalName);
    const c = b.curriculum;
    const gradeCode = c?.grade.code ?? d?.gradeCode ?? name.gradeCode;
    const subjectCode = c?.subject.code ?? d?.subjectCode ?? name.subjectCode;
    const kind: BookGuess["kind"] = c?.kind ?? (d && d.kind !== "TEXTBOOK" ? d.kind : name.kind);
    const sure = b.autoLinked || (d ? d.confidence === "high" : !!name.gradeCode && !!name.subjectCode);
    return {
      id: b.id, originalName: b.originalName, status: b.status, error: b.error, pageCount: b.pageCount, textPageCount: b.textPageCount, processedPages: b.processedPages,
      trackCode: c?.track.code ?? "GENERAL", gradeCode, subjectCode, kind, sure: sure && !!gradeCode && !!subjectCode,
      linked: !!b.curriculumId, autoLinked: b.autoLinked, evidence: d?.evidence ?? null, source: d?.source ?? null,
      working: b.status === "UPLOADED" || b.status === "PROCESSING" || (d === null && b.status !== "FAILED"),
    };
  });
}

/** تأكيد المستخدم (أو تصحيحه): يضع كل كتاب في منهجه ويُعدّه مؤكَّداً. كل عنصر مستقل. */
export async function confirmPlacements(actor: Actor, input: z.infer<typeof confirmSchema>) {
  const results: { bookId: string; ok: boolean; created?: boolean; curriculumId?: string; code?: string }[] = [];
  for (const it of input.items) {
    const r = await placeBook(actor, it.bookId, { trackCode: it.trackCode, gradeCode: it.gradeCode, subjectCode: it.subjectCode, kind: it.kind }, "confirm");
    results.push({ bookId: it.bookId, ...(r.ok ? { ok: true, created: r.created, curriculumId: r.curriculumId } : { ok: false, code: r.code }) });
  }
  return results;
}

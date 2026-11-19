import "server-only";
import { z } from "zod";
import { db } from "../db";
import { codeSchema } from "../http";
import type { Actor } from "../admin/audit";
import { env } from "../env";
import { buildReport, issueMessage } from "./health";
import { loadBookInputs } from "./health-data";
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
    part: z.number().int().min(0).max(5).default(0),
  })).min(1).max(200),
});

export type ReviewItem = {
  id: string; originalName: string; status: string; error: string | null; pageCount: number | null; textPageCount: number | null; processedPages: number;
  trackCode: string; gradeCode: string | null; subjectCode: string | null; kind: BookGuess["kind"]; part: number;
  /** واثق: النظام يرجّح صحة الاقتراح (غلاف بعبارة صف صريحة، أو ربط تلقائي سابق) */
  sure: boolean; linked: boolean; autoLinked: boolean; evidence: string | null; source: string | null;
  /** ما زال يُقرأ/يُتعرَّف عليه */
  working: boolean;
  /** نتائج فحص السلامة (قبل التأكيد): أخطاء وتنبيهات بنص مفهوم */
  problems: { severity: "error" | "warn"; text: string }[];
};

/**
 * كتب تنتظر مراجعة المستخدم: كل كتاب لم يُؤكَّد بعد (مربوط تلقائياً أو غير مربوط).
 * المصدر الأول للاقتراح: منهجه الحالي، ثم محتوى الغلاف، ثم اسم الملف احتياطاً.
 */
export async function listReview(): Promise<ReviewItem[]> {
  // فحص السلامة على عيّنة من أول 30 صفحة لكل كتاب منتظر (سريع حتى مع تحديث الصفحة كل 3 ثوانٍ)
  const health = buildReport(await loadBookInputs(db, env.STORAGE_DIR, { onlyUnconfirmed: true, maxPages: 30 }));
  const problemsOf = new Map(health.books.map((b) => [b.id, b.issues.filter((i) => i.severity !== "info" && i.code !== "NOT_LINKED" && i.code !== "NOT_CONFIRMED" && i.code !== "DUPLICATE_CONTENT").map((i) => ({ severity: i.severity as "error" | "warn", text: `${issueMessage(i.code)}${i.detail ? ` (${i.detail})` : ""}` }))]));
  const dup = new Map(health.books.map((b) => [b.id, b.issues.find((i) => i.code === "DUPLICATE_CONTENT")]));
  const books = await db.uploadedBook.findMany({
    where: { ownerId: null, confirmedAt: null },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true, originalName: true, status: true, error: true, pageCount: true, textPageCount: true, processedPages: true, detected: true, autoLinked: true, curriculumId: true,
      curriculum: { select: { kind: true, part: true, grade: { select: { code: true } }, subject: { select: { code: true } }, track: { select: { code: true } } } },
    },
  });
  return books.map((b) => {
    const d = b.detected as Detected | null;
    const name = guessFromName(b.originalName);
    const c = b.curriculum;
    // قراءة الغلاف الواثقة تتقدم على المنهج الحالي: إن اختلفا فالأرجح أن المنهج وُضع خطأً (يظهر تنبيه COVER_MISMATCH في البطاقة)
    const cover = d && d.confidence === "high" ? d : null;
    const gradeCode = cover?.gradeCode ?? c?.grade.code ?? d?.gradeCode ?? name.gradeCode;
    const subjectCode = cover?.subjectCode ?? c?.subject.code ?? d?.subjectCode ?? name.subjectCode;
    const kind: BookGuess["kind"] = cover && cover.kind !== "TEXTBOOK" ? cover.kind : (c?.kind ?? (d && d.kind !== "TEXTBOOK" ? d.kind : name.kind));
    const part = cover && cover.part ? cover.part : c ? c.part : (d?.part || name.part || 0);
    const sure = b.autoLinked || (d ? d.confidence === "high" : !!name.gradeCode && !!name.subjectCode);
    return {
      id: b.id, originalName: b.originalName, status: b.status, error: b.error, pageCount: b.pageCount, textPageCount: b.textPageCount, processedPages: b.processedPages,
      trackCode: c?.track.code ?? "GENERAL", gradeCode, subjectCode, kind, part, sure: sure && !!gradeCode && !!subjectCode,
      linked: !!b.curriculumId, autoLinked: b.autoLinked, evidence: d?.evidence ?? null, source: d?.source ?? null,
      working: b.status === "UPLOADED" || b.status === "PROCESSING" || (d === null && b.status !== "FAILED"),
      problems: [...(problemsOf.get(b.id) ?? []), ...(dup.get(b.id) ? [{ severity: "warn" as const, text: `${issueMessage("DUPLICATE_CONTENT")} (${dup.get(b.id)!.detail})` }] : [])],
    };
  });
}

/** تأكيد المستخدم (أو تصحيحه): يضع كل كتاب في منهجه ويُعدّه مؤكَّداً. كل عنصر مستقل. */
export async function confirmPlacements(actor: Actor, input: z.infer<typeof confirmSchema>) {
  const results: { bookId: string; ok: boolean; created?: boolean; curriculumId?: string; code?: string }[] = [];
  for (const it of input.items) {
    const r = await placeBook(actor, it.bookId, { trackCode: it.trackCode, gradeCode: it.gradeCode, subjectCode: it.subjectCode, kind: it.kind, part: it.part }, "confirm");
    results.push({ bookId: it.bookId, ...(r.ok ? { ok: true, created: r.created, curriculumId: r.curriculumId } : { ok: false, code: r.code }) });
  }
  return results;
}

/**
 * أمكنة (مسار|صف|مادة|نوع|جزء) المشغولة بكتب مؤكَّدة: تُنبّه المراجعة إن وُضع كتاب ثانٍ في المكان نفسه
 * (غالباً جزء ثانٍ من الكتاب نفسه فتتعارض أرقام صفحاتهما).
 */
export async function listOccupiedKeys(): Promise<string[]> {
  const rows = await db.uploadedBook.findMany({
    where: { ownerId: null, confirmedAt: { not: null }, curriculumId: { not: null } },
    select: { curriculum: { select: { kind: true, part: true, track: { select: { code: true } }, grade: { select: { code: true } }, subject: { select: { code: true } } } } },
  });
  return [...new Set(rows.flatMap((r) => (r.curriculum ? [`${r.curriculum.track.code}|${r.curriculum.grade.code}|${r.curriculum.subject.code}|${r.curriculum.kind}|${r.curriculum.part}`] : [])))];
}

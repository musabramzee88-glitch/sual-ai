import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { env } from "../env";
import { audit, type Actor } from "../admin/audit";
import { extractPdfPages } from "./extract";
import { ocrEnabled, ocrPdfPages, runOcrExclusive } from "./ocr";
import { guessFromCover, guessSubjectFromContent, type CoverGuess } from "./cover";
import { placeBook } from "./placement";
import { hasRealText } from "./text";

export const MAX_BOOK_BYTES = 100 * 1024 * 1024;
/** نبض الحياة كل صفحة؛ كتاب بلا نبض 5 دقائق يُعدّ عالقاً (خادم أُغلق) ويجوز إعادة معالجته */
export const STALE_MS = 5 * 60_000;

class CancelledError extends Error {}

/** استخراج النص يحمّل الملف كاملاً بالذاكرة: لا أكثر من 2 في وقت واحد (رفع 20 كتاباً معاً لا يستنزف الذاكرة) */
const EXTRACT_SLOTS = 2;
let active = 0;
const waiters: (() => void)[] = [];
export async function withExtractSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= EXTRACT_SLOTS) await new Promise<void>((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

type Fail<C extends string> = { ok: false; code: C };
const fail = <C extends string>(code: C): Fail<C> => ({ ok: false, code });

/** التخزين خارج public دائماً؛ المفتاح يولَّد داخلياً فقط (لا أسماء من المستخدم في المسار) */
const root = () => path.resolve(env.STORAGE_DIR);
export const fileOf = (key: string) => {
  const p = path.resolve(root(), key);
  if (!p.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return p;
};

/** صورة الغلاف المصغّرة (تُنشأ عند أول طلب وتُخزَّن) */
export const coverFile = (id: string) => fileOf(`covers/${id}.jpg`);

const cleanName = (n: string) => n.replace(/[\u0000-\u001F<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "book.pdf";

/** رفع كتاب لمكتبة المنصة (من الإدارة). يتحقق من النوع الفعلي (لا الامتداد) والحجم ويمنع التكرار. */
export async function uploadBook(actor: Actor, file: { name: string; bytes: Uint8Array }, curriculumId?: string | null) {
  if (file.bytes.byteLength === 0) return fail("EMPTY_FILE");
  if (file.bytes.byteLength > MAX_BOOK_BYTES) return fail("FILE_TOO_LARGE");
  if (Buffer.from(file.bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") return fail("NOT_PDF");
  if (curriculumId && !(await db.curriculum.findUnique({ where: { id: curriculumId } }))) return fail("CURRICULUM_NOT_FOUND");

  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  const dup = await db.uploadedBook.findFirst({ where: { sha256, ownerId: null }, select: { id: true } });
  if (dup) return { ok: false as const, code: "DUPLICATE" as const, existingId: dup.id };

  const storageKey = `books/${randomUUID()}.pdf`;
  await mkdir(path.dirname(fileOf(storageKey)), { recursive: true });
  await writeFile(fileOf(storageKey), file.bytes, { flag: "wx" });
  try {
    const book = await db.$transaction(async (tx) => {
      const b = await tx.uploadedBook.create({
        data: { ownerId: null, curriculumId: curriculumId ?? null, originalName: cleanName(file.name), storageKey, mimeType: "application/pdf", sizeBytes: file.bytes.byteLength, sha256 },
      });
      await audit(tx, actor, { action: "book.upload", targetType: "UploadedBook", targetId: b.id, after: { name: b.originalName, sizeBytes: b.sizeBytes, sha256 } });
      return b;
    });
    return { ok: true as const, id: book.id };
  } catch (e) {
    await rm(fileOf(storageKey), { force: true });
    throw e;
  }
}

/**
 * يستخرج نص كل صفحة ويخزّنه. يحجز الكتاب أولاً (لا معالجتان متزامنتان للكتاب نفسه).
 * الصفحات التي لا نص فيها (صور) تُقرأ بـ OCR محلي إن كان مفعّلاً؛ وتُعلَّم isOcr والكتاب يحمل تنبيه OCR_USED.
 * كتاب بلا أي نص بعد المحاولة → FAILED/NEEDS_OCR؛ نص جزئي → READY مع PARTIAL_TEXT.
 */
export async function processBook(id: string, opts: { ocr?: boolean; actor?: Actor } = {}, now = new Date()) {
  const wantOcr = (opts.ocr ?? true) && ocrEnabled();
  const claimed = await db.uploadedBook.updateMany({
    where: { id, OR: [{ status: { in: ["UPLOADED", "FAILED"] } }, { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - STALE_MS) } }, { status: "READY" }] },
    data: { status: "PROCESSING", error: null, processedPages: 0 },
  });
  if (claimed.count !== 1) return fail("BUSY_OR_MISSING");
  const book = await db.uploadedBook.findUniqueOrThrow({ where: { id } });
  try {
    const bytes = new Uint8Array(await readFile(fileOf(book.storageKey)));
    const pages: { pageNumber: number; text: string; hasText: boolean; isOcr: boolean }[] = (await withExtractSlot(() => extractPdfPages(bytes))).map((p) => ({ ...p, isOcr: false }));
    // الإلغاء أثناء الاستخراج: التحديث الشرطي لا يمس شيئاً إن لم تعد الحالة PROCESSING
    if ((await db.uploadedBook.updateMany({ where: { id, status: "PROCESSING" }, data: { pageCount: pages.length, processedPages: pages.length } })).count !== 1) throw new CancelledError();

    const blank = pages.filter((p) => !p.hasText).map((p) => p.pageNumber);
    let ocrUsed = false;
    if (blank.length > 0 && wantOcr) {
      // نبض الحياة: كل صفحة تحدّث updatedAt فلا يُعاد حجز كتاب يُعالَج منذ دقائق
      let done = 0;
      const results = await runOcrExclusive(async () => {
        await assertStillProcessing(id); // أُلغي أثناء الانتظار في الطابور؟
        return ocrPdfPages(bytes, blank, async (n) => {
          done = n;
          // التحديث الشرطي يكشف الإلغاء: إن لم تعد الحالة PROCESSING لا يتأثر أي صف
          const u = await db.uploadedBook.updateMany({ where: { id, status: "PROCESSING" }, data: { processedPages: pages.length - blank.length + done } });
          if (u.count !== 1) throw new CancelledError();
        });
      });
      for (const r of results) {
        const p = pages[r.pageNumber - 1];
        p.text = r.text;
        p.hasText = r.hasText;
        p.isOcr = r.hasText; // لا نعلّم صفحة فارغة بأنها OCR
        if (r.hasText) ocrUsed = true;
      }
    }

    const textPages = pages.filter((p) => p.hasText).length;
    await db.$transaction(async (tx) => {
      await tx.bookPage.deleteMany({ where: { bookId: id } });
      for (let i = 0; i < pages.length; i += 200) {
        await tx.bookPage.createMany({ data: pages.slice(i, i + 200).map((p) => ({ bookId: id, pageNumber: p.pageNumber, text: p.text, isOcr: p.isOcr })) });
      }
      await tx.uploadedBook.update({
        where: { id },
        data: {
          pageCount: pages.length,
          textPageCount: textPages,
          processedPages: pages.length,
          status: textPages === 0 ? "FAILED" : "READY",
          error: textPages === 0 ? "NEEDS_OCR" : textPages < pages.length * 0.6 ? "PARTIAL_TEXT" : ocrUsed ? "OCR_USED" : null,
        },
      });
    }, { timeout: 120_000 });
    // التعرّف على الكتاب من غلافه (فشله لا يفشل المعالجة)
    await detectBook(id, opts.actor).catch((e) => console.error(`[books] detection failed for ${id}: ${(e as Error).name}`));
    return { ok: true as const, pageCount: pages.length, textPages, ocrPages: pages.filter((p) => p.isOcr).length };
  } catch (e) {
    if (e instanceof CancelledError) return fail("CANCELLED");
    // لا نخزّن تفاصيل داخلية؛ رمز خطأ مفهوم فقط
    console.error(`[books] processing failed for ${id}: ${(e as Error).name}: ${(e as Error).message?.slice(0, 160)}`);
    await db.uploadedBook.update({ where: { id }, data: { status: "FAILED", error: "EXTRACT_FAILED" } });
    return fail("EXTRACT_FAILED");
  }
}

export type Detected = Pick<CoverGuess, "gradeCode" | "subjectCode" | "kind" | "confidence" | "evidence"> & { source: "text" | "ocr" };

/**
 * يتعرّف على الصف والمادة ونوع الكتاب من نص الصفحات الأولى (الغلاف)، فأسماء الملفات المحمّلة كثيراً ما
 * تفقد حروفها العربية. الصفحات المصوّرة: يقرأ أول صفحتين فقط بـ OCR (ثوانٍ) ولو كان OCR الكتاب مطفأً.
 * إن لم تحمل الصفحات الأولى عبارة «للصف …» صريحة تُجرَّب قراءة الصفحتين الأوليين بـ OCR أيضاً وتُؤخذ الأفضل.
 */
export async function detectBook(id: string, actor?: Actor): Promise<Detected | null> {
  const b = await db.uploadedBook.findUnique({
    where: { id },
    select: { storageKey: true, pageCount: true, curriculumId: true, pages: { where: { pageNumber: { lte: 10 } }, orderBy: { pageNumber: "asc" }, select: { pageNumber: true, text: true } } },
  });
  if (!b) return null;
  const textOf = (max: number) => b.pages.filter((p) => p.pageNumber <= max).map((p) => p.text).join("\n");
  const front = textOf(4);
  let best: Detected = { ...guessFromCover(front), source: "text" };
  // عبارة «للصف …» قد تكون في صفحة العنوان الداخلية لا الغلاف
  if (best.confidence !== "high") {
    const wide: Detected = { ...guessFromCover(textOf(10)), source: "text" };
    if (wide.confidence === "high") best = wide;
  }
  const needOcr = !hasRealText(front) || best.confidence === "low";
  if (needOcr && ocrEnabled() && (b.pageCount ?? 0) > 0) {
    try {
      const bytes = new Uint8Array(await readFile(fileOf(b.storageKey)));
      const res = await runOcrExclusive(() => ocrPdfPages(bytes, [1, 2].filter((n) => n <= (b.pageCount ?? 0))));
      const viaOcr: Detected = { ...guessFromCover(res.map((r) => r.text).join("\n")), source: "ocr" };
      if (viaOcr.confidence === "high" || !hasRealText(front)) best = viaOcr;
    } catch (e) {
      console.error(`[books] cover OCR failed for ${id}: ${(e as Error).name}`);
    }
  }
  // احتياط ضعيف: مادة من كلمات المحتوى إن غابت من الغلاف (الثقة تبقى low)
  if (!best.subjectCode) {
    const c = guessSubjectFromContent(textOf(10));
    if (c) best = { ...best, subjectCode: c };
  }
  await db.uploadedBook.update({ where: { id }, data: { detected: best } });
  // تعرّف واثق → يوضع في مكانه تلقائياً (يبقى ينتظر مراجعتك). لا يلمس كتاباً ربطه المستخدم.
  if (actor && !b.curriculumId && best.confidence === "high" && best.gradeCode && best.subjectCode) {
    const r = await placeBook(actor, id, { trackCode: "GENERAL", gradeCode: best.gradeCode, subjectCode: best.subjectCode, kind: best.kind }, "auto");
    if (!r.ok && r.code !== "NO_CURRENT_YEAR" && r.code !== "ALREADY_LINKED") console.error(`[books] auto placement failed for ${id}: ${r.code}`);
  }
  return best;
}

/** يجري التعرّف على الكتب المحدّدة بالتتابع (للكتب المرفوعة قبل هذه الميزة) */
export async function detectMany(ids: string[], actor?: Actor) {
  for (const id of ids) await detectBook(id, actor).catch(() => null);
}

async function assertStillProcessing(id: string) {
  const b = await db.uploadedBook.findUnique({ where: { id }, select: { status: true } });
  if (b?.status !== "PROCESSING") throw new CancelledError();
}

/** إيقاف معالجة كتاب (جارية أو بالانتظار). المهمة الجارية تتوقف عند الصفحة التالية. */
export async function cancelProcessing(actor: Actor, ids?: string[]) {
  const r = await db.$transaction(async (tx) => {
    const res = await tx.uploadedBook.updateMany({
      where: { ownerId: null, status: { in: ["PROCESSING", "UPLOADED"] }, ...(ids ? { id: { in: ids } } : {}) },
      data: { status: "FAILED", error: "CANCELLED" },
    });
    await audit(tx, actor, { action: "book.cancel_processing", targetType: "UploadedBook", after: { count: res.count, ids: ids ?? "all" } });
    return res.count;
  });
  return { ok: true as const, cancelled: r };
}

/** معالجة عدة كتب بالتتابع (دفعة «إعادة معالجة كل المصوَّرة») */
export async function processMany(ids: string[], actor?: Actor) {
  for (const id of ids) await processBook(id, { actor });
}

export async function linkBook(actor: Actor, id: string, curriculumId: string | null) {
  return db.$transaction(async (tx) => {
    const b = await tx.uploadedBook.findUnique({ where: { id } });
    if (!b) return fail("NOT_FOUND");
    if (curriculumId && !(await tx.curriculum.findUnique({ where: { id: curriculumId } }))) return fail("CURRICULUM_NOT_FOUND");
    await tx.uploadedBook.update({ where: { id }, data: { curriculumId } });
    await audit(tx, actor, { action: "book.link", targetType: "UploadedBook", targetId: id, before: { curriculumId: b.curriculumId }, after: { curriculumId } });
    return { ok: true as const };
  });
}

/** حذف كتاب غير مستعمل في أي امتحان (السجل + الصفحات + الملف) */
export async function deleteBook(actor: Actor, id: string) {
  const b = await db.uploadedBook.findUnique({ where: { id }, include: { _count: { select: { examSources: true } } } });
  if (!b) return fail("NOT_FOUND");
  if (b._count.examSources > 0) return fail("IN_USE");
  if (b.status === "PROCESSING" && Date.now() - b.updatedAt.getTime() < STALE_MS) return fail("BUSY_OR_MISSING"); // العالق (بلا نبض) يجوز حذفه
  await db.$transaction(async (tx) => {
    await tx.uploadedBook.delete({ where: { id } });
    await audit(tx, actor, { action: "book.delete", targetType: "UploadedBook", targetId: id, before: { name: b.originalName, sha256: b.sha256 } });
  });
  await rm(fileOf(b.storageKey), { force: true });
  await rm(coverFile(id), { force: true });
  return { ok: true as const };
}

export const listLibraryBooks = () =>
  db.uploadedBook.findMany({
    where: { ownerId: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, originalName: true, sizeBytes: true, pageCount: true, textPageCount: true, processedPages: true, updatedAt: true, detected: true, confirmedAt: true, status: true, error: true, createdAt: true, curriculumId: true,
      curriculum: { select: { title: true, grade: { select: { nameAr: true, nameEn: true } }, subject: { select: { nameAr: true, nameEn: true } } } },
    },
  });

export const getBookPage = (bookId: string, pageNumber: number) =>
  db.bookPage.findUnique({ where: { bookId_pageNumber: { bookId, pageNumber } } });
export const getBook = (id: string) => db.uploadedBook.findUnique({ where: { id }, include: { curriculum: { select: { title: true } } } });

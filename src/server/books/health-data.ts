import { stat } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { BookCheckInput } from "./health";

const STALE_MS = 5 * 60_000; // نفس عتبة العالق في service.ts

/**
 * يجمع مدخلات الفحص من قاعدة البيانات والقرص. يأخذ عميل Prisma ومجلد التخزين كوسيطين
 * (لا يستورد server-only) ليعمل في الواجهة وفي سكربت سطر الأوامر معاً.
 */
export async function loadBookInputs(prisma: PrismaClient, storageDir: string, now = Date.now()): Promise<BookCheckInput[]> {
  const books = await prisma.uploadedBook.findMany({
    where: { ownerId: null },
    orderBy: { originalName: "asc" },
    select: {
      id: true, originalName: true, status: true, error: true, updatedAt: true, sizeBytes: true, storageKey: true, pageCount: true, textPageCount: true, confirmedAt: true, detected: true,
      pages: { orderBy: { pageNumber: "asc" }, select: { pageNumber: true, text: true, isOcr: true } },
      curriculum: {
        select: {
          id: true, title: true, kind: true, part: true, grade: { select: { code: true } }, subject: { select: { code: true } },
          chapters: { orderBy: { sortOrder: "asc" }, select: { title: true, pageStart: true, pageEnd: true } },
          _count: { select: { books: true } },
        },
      },
    },
  });
  return Promise.all(books.map(async (b) => {
    const size = await stat(path.resolve(storageDir, b.storageKey)).then((s) => s.size).catch(() => null);
    const c = b.curriculum;
    return {
      id: b.id, name: b.originalName, status: b.status, error: b.error,
      stale: b.status === "PROCESSING" && now - b.updatedAt.getTime() > STALE_MS,
      sizeBytes: b.sizeBytes, fileSizeOnDisk: size, pageCount: b.pageCount, textPageCount: b.textPageCount, confirmed: b.confirmedAt !== null,
      pages: b.pages, detected: b.detected as BookCheckInput["detected"],
      curriculum: c ? { id: c.id, title: c.title, gradeCode: c.grade.code, subjectCode: c.subject.code, kind: c.kind, part: c.part, chapters: c.chapters, booksCount: c._count.books } : null,
    };
  }));
}

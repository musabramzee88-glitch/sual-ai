import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { env } from "../env";
import { geminiJson } from "../ai/gemini";
import { renderPagesJpeg } from "./page-image";
import { fileOf } from "./service";
import { chaptersFromEntries, tocCandidatePages, type TocEntry, type TocResult } from "./toc";

/**
 * قراءة صفحة «المحتويات» بنموذج رؤية (Gemini) لكتب فهرسها جدول مصوَّر أو أفسد OCR أرقامه.
 * النموذج يقرأ العناوين والأرقام المطبوعة فقط؛ تحويلها لصفحات الملف يمر بالتحقق نفسه في toc.ts
 * (مطابقة العناوين، أو أرقام ذيل الصفحات). الرد يُخزَّن في STORAGE_DIR/ai-cache فلا يُستهلك من الحصة مرتين.
 */
const SCHEMA = {
  type: "OBJECT",
  properties: {
    isContents: { type: "BOOLEAN" },
    entries: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { title: { type: "STRING" }, page: { type: "INTEGER", nullable: true }, level: { type: "INTEGER" } },
        required: ["title", "level"],
      },
    },
  },
  required: ["isContents", "entries"],
};

const PROMPT = `These images are pages from an Iraqi school textbook (Arabic or English).
If one or more of them is the table of contents (المحتويات / الفهرس / Contents), extract EVERY entry in order.
For each entry return:
- title: exactly as printed (keep Arabic spelling), WITHOUT the page number, dots or leaders.
- page: the printed page number where it starts (convert Arabic-Indic digits ٠-٩ to normal digits), or null if not printed.
- level: 1 for a unit/chapter/part (الوحدة، الفصل، الباب، Unit, Chapter), 2 for a lesson or sub-topic inside it.
Skip headers like "الموضوع" / "رقم الصفحة", the introduction (المقدمة), tests and glossaries.
If none of the images is a table of contents, return isContents=false and entries=[]. Do not invent entries.`;

type Cached = { pages: number[]; model: string; isContents: boolean; entries: { title: string; page: number | null; level: number }[] };

const cacheFile = (bookId: string) => path.join(path.resolve(env.STORAGE_DIR), "ai-cache", `toc-${bookId}.json`);

export async function readTocWithVision(bookId: string): Promise<{ result: TocResult | null; cached: boolean; sentPages: number[]; entries: number; isContents: boolean }> {
  const book = await db.uploadedBook.findUniqueOrThrow({ where: { id: bookId }, select: { storageKey: true, pageCount: true } });
  const pageCount = book.pageCount ?? 0;
  const pages = await db.bookPage.findMany({ where: { bookId }, select: { pageNumber: true, text: true }, orderBy: { pageNumber: "asc" } });

  let data: Cached | null = null;
  try { data = JSON.parse(await readFile(cacheFile(bookId), "utf8")) as Cached; } catch { /* لا ذاكرة بعد */ }
  const cached = !!data;
  if (!data) {
    const found = tocCandidatePages(pages, pageCount);
    // الصفحة المرشّحة وتاليتها (فهرس من صفحتين)، وإلا أطراف الكتاب حيث يكون الفهرس عادة
    const pick = found.length ? [...new Set(found.flatMap((n) => [n, n + 1]))] : [2, 3, 4, pageCount - 2, pageCount - 1, pageCount];
    const sent = pick.filter((n) => n >= 1 && n <= pageCount).slice(0, 6);
    const bytes = new Uint8Array(await readFile(fileOf(book.storageKey)));
    const images = (await renderPagesJpeg(bytes, sent)).map((r) => ({ data: r.jpeg, mime: "image/jpeg" as const }));
    const r = await geminiJson<{ isContents: boolean; entries: { title: string; page?: number | null; level: number }[] }>({ prompt: PROMPT, images, schema: SCHEMA });
    data = { pages: sent, model: env.GEMINI_MODEL, isContents: !!r.isContents, entries: (r.entries ?? []).map((e) => ({ title: String(e.title ?? "").trim(), page: Number.isInteger(e.page) ? (e.page as number) : null, level: e.level === 1 ? 1 : 2 })) };
    await mkdir(path.dirname(cacheFile(bookId)), { recursive: true });
    await writeFile(cacheFile(bookId), JSON.stringify(data, null, 1));
  }
  const entries: TocEntry[] = data.entries
    .filter((e) => e.title.length >= 2 && (e.page === null || (e.page >= 1 && e.page <= pageCount)))
    .map((e) => ({ title: e.title.slice(0, 200), printed: e.page, level: e.level as 1 | 2 }));
  const result = data.isContents && entries.length >= 3 ? chaptersFromEntries(pages, pageCount, entries, { tocPages: new Set(data.pages), trusted: true }) : null;
  return { result, cached, sentPages: data.pages, entries: entries.length, isContents: data.isContents };
}

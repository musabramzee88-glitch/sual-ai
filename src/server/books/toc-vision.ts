import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { env } from "../env";
import { currentModel, geminiJson } from "../ai/gemini";
import { renderPagesJpeg } from "./page-image";
import { fileOf } from "./service";
import { chaptersFromEntries, tocCandidatePages, type TocEntry, type TocResult } from "./toc";

/**
 * قراءة صفحة «المحتويات» بنموذج رؤية (Gemini) لكتب فهرسها جدول مصوَّر أو أفسد OCR أرقامه.
 * النموذج يقرأ العناوين وأرقامها المطبوعة، ورقم الصفحة المطبوع على كل صورة مرسلة؛ ومن الأخير يُعرف فرق الترقيم
 * (صفحة الملف − المطبوعة) مباشرة. التحويل لصفحات الملف يمر بـ chaptersFromEntries.
 * الرد يُخزَّن في STORAGE_DIR/ai-cache فلا يُستهلك من الحصة مرتين.
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
    printedNumbers: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { image: { type: "INTEGER" }, number: { type: "INTEGER", nullable: true } }, required: ["image"] },
    },
  },
  required: ["isContents", "entries", "printedNumbers"],
};

const PROMPT = `These images are pages from an Iraqi school textbook (Arabic or English), given in order (image 1, image 2, ...).
1) If one or more of them is the table of contents (المحتويات / الفهرس / Contents), extract EVERY entry in order:
   - title: exactly as printed (keep Arabic spelling), WITHOUT the page number, dots or leaders.
   - page: the printed page number where it starts (convert Arabic-Indic digits ٠-٩ to normal digits), or null if not printed.
   - level: 1 for a unit/chapter/part (الوحدة، الفصل، الباب، Unit, Chapter), 2 for a lesson or sub-topic inside it.
   Skip headers like "الموضوع" / "رقم الصفحة", the introduction (المقدمة), tests and glossaries.
   If none of the images is a table of contents, return isContents=false and entries=[]. Do not invent entries.
2) printedNumbers: for EVERY image, the page number printed on that page itself (usually in a corner or the footer),
   as {image: <1-based image index>, number: <digits or null if none is printed>}.`;

type Cached = {
  pages: number[]; model: string; isContents: boolean;
  entries: { title: string; page: number | null; level: number }[];
  printed?: { pdfPage: number; number: number }[];
};

const cacheFile = (bookId: string) => path.join(path.resolve(env.STORAGE_DIR), "ai-cache", `toc-${bookId}.json`);

/** فرق الترقيم من أرقام الصفحات المطبوعة على الصور: الأكثر تكراراً، بشرط اتفاق الأغلبية */
export function offsetFromPrinted(printed: { pdfPage: number; number: number }[]): number | null {
  const offs = printed.map((p) => p.pdfPage - p.number).filter((o) => o >= 0 && o <= 16);
  if (offs.length === 0) return null;
  const count = new Map<number, number>();
  for (const o of offs) count.set(o, (count.get(o) ?? 0) + 1);
  const [best, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return n * 2 > offs.length || (offs.length === 1 && n === 1) ? best : null;
}

async function ask(storageKey: string, sent: number[]): Promise<Cached> {
  const bytes = new Uint8Array(await readFile(fileOf(storageKey)));
  const rendered = await renderPagesJpeg(bytes, sent);
  const model = currentModel();
  const r = await geminiJson<{ isContents: boolean; entries: { title: string; page?: number | null; level: number }[]; printedNumbers?: { image: number; number?: number | null }[] }>({
    prompt: PROMPT, images: rendered.map((x) => ({ data: x.jpeg, mime: "image/jpeg" as const })), schema: SCHEMA,
  });
  const printed = (r.printedNumbers ?? [])
    .filter((p) => Number.isInteger(p.number) && p.image >= 1 && p.image <= rendered.length)
    .map((p) => ({ pdfPage: rendered[p.image - 1].pageNumber, number: p.number as number }));
  return {
    pages: rendered.map((x) => x.pageNumber), model, isContents: !!r.isContents, printed,
    entries: (r.entries ?? []).map((e) => ({ title: String(e.title ?? "").trim(), page: Number.isInteger(e.page) ? (e.page as number) : null, level: e.level === 1 ? 1 : 2 })),
  };
}

export type VisionToc = { result: TocResult | null; cached: boolean; sentPages: number[]; entries: number; isContents: boolean };

/** refresh: يتجاهل الرد المخزَّن ويسأل مجدداً (لكتاب تعذّر التحقق من رده السابق) */
export async function readTocWithVision(bookId: string, opts: { refresh?: boolean } = {}): Promise<VisionToc> {
  const book = await db.uploadedBook.findUniqueOrThrow({ where: { id: bookId }, select: { storageKey: true, pageCount: true } });
  const pageCount = book.pageCount ?? 0;
  const pages = await db.bookPage.findMany({ where: { bookId }, select: { pageNumber: true, text: true }, orderBy: { pageNumber: "asc" } });

  let data: Cached | null = null;
  if (opts.refresh) await rm(cacheFile(bookId), { force: true });
  else try { data = JSON.parse(await readFile(cacheFile(bookId), "utf8")) as Cached; } catch { /* لا ذاكرة بعد */ }
  const cached = !!data;
  if (!data) {
    const valid = (ns: number[]) => [...new Set(ns)].filter((n) => n >= 1 && n <= pageCount);
    const edges = valid([2, 3, 4, 5, pageCount - 1, pageCount]);
    const found = tocCandidatePages(pages, pageCount);
    // الصفحة المرشّحة من النص وتاليتها؛ وإلا أطراف الكتاب حيث يكون الفهرس عادة
    const first = found.length ? valid(found.flatMap((n) => [n, n + 1])).slice(0, 6) : edges;
    data = await ask(book.storageKey, first);
    // الترشيح من النص أخطأ (كلمة «المحتويات» في صفحة أخرى): محاولة ثانية بأطراف الكتاب
    if (!data.isContents && found.length) {
      const rest = edges.filter((n) => !first.includes(n));
      if (rest.length) data = await ask(book.storageKey, rest);
    }
    await mkdir(path.dirname(cacheFile(bookId)), { recursive: true });
    await writeFile(cacheFile(bookId), JSON.stringify(data, null, 1));
  }
  const entries: TocEntry[] = data.entries
    .filter((e) => e.title.length >= 2 && (e.page === null || (e.page >= 1 && e.page <= pageCount)))
    .map((e) => ({ title: e.title.slice(0, 200), printed: e.page, level: e.level as 1 | 2 }));
  const knownOffset = data.printed?.length ? offsetFromPrinted(data.printed) : null;
  const result = data.isContents && entries.length >= 3
    ? chaptersFromEntries(pages, pageCount, entries, { tocPages: new Set(data.pages), trusted: true, knownOffset })
    : null;
  return { result, cached, sentPages: data.pages, entries: entries.length, isContents: data.isContents };
}

/** هل الرد المخزَّن قديم (بلا أرقام الصفحات المطبوعة) — يستحق سؤالاً جديداً إن تعذّر التحقق */
export async function cacheLacksPrinted(bookId: string): Promise<boolean> {
  try { return !(JSON.parse(await readFile(cacheFile(bookId), "utf8")) as Cached).printed; } catch { return false; }
}

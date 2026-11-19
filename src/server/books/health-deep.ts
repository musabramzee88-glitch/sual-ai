import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { extractPdfPages } from "./extract";
import type { Issue } from "./health";

/** يطبّع النص للمقارنة: بلا مسافات/اتجاهات، فالفروق الشكلية لا تُحتسب */
const norm = (t: string) => t.normalize("NFKC").replace(/[\s​-‏‪-‮]/g, "");

export type DeepTarget = { id: string; name: string; storageKey: string; sha256: string; pageCount: number | null; pages: { pageNumber: number; text: string; isOcr: boolean }[] };

export async function loadDeepTargets(prisma: PrismaClient): Promise<DeepTarget[]> {
  const rows = await prisma.uploadedBook.findMany({
    where: { ownerId: null }, orderBy: { originalName: "asc" },
    select: { id: true, originalName: true, storageKey: true, sha256: true, pageCount: true, pages: { orderBy: { pageNumber: "asc" }, select: { pageNumber: true, text: true, isOcr: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.originalName, storageKey: r.storageKey, sha256: r.sha256, pageCount: r.pageCount, pages: r.pages }));
}

/**
 * فحص عميق لكتاب واحد: يعيد قراءة ملفه من القرص ويتحقق من (1) بصمته، (2) أن PDF يُفتح وعدد صفحاته،
 * (3) أن نص كل صفحة (غير OCR) المخزَّن في القاعدة ما زال يطابق نص الملف. الملف المفقود يتولاه الفحص العادي.
 */
export async function deepCheckBook(t: DeepTarget, storageDir: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  let bytes: Buffer;
  try {
    bytes = await readFile(path.resolve(storageDir, t.storageKey));
  } catch {
    return issues;
  }
  if (createHash("sha256").update(bytes).digest("hex") !== t.sha256) issues.push({ code: "HASH_MISMATCH", severity: "error" });

  let fresh;
  try {
    fresh = await extractPdfPages(new Uint8Array(bytes));
  } catch {
    issues.push({ code: "PDF_UNREADABLE", severity: "error" });
    return issues;
  }
  if (t.pageCount != null && fresh.length !== t.pageCount) issues.push({ code: "PAGECOUNT_MISMATCH", severity: "error", detail: `${fresh.length} ≠ ${t.pageCount}` });

  const stored = new Map(t.pages.map((p) => [p.pageNumber, p]));
  let compared = 0, differ = 0;
  let sample = "";
  for (const f of fresh) {
    const s = stored.get(f.pageNumber);
    if (!s || s.isOcr) continue; // صفحات OCR لا مصدر نصي لها لمقارنتها
    // الصفحات الفارغة عند الطرفين (رسوم/أغلفة) لا تُقارَن
    if ((s.text.match(/\p{L}/gu)?.length ?? 0) < 10 && (f.text.match(/\p{L}/gu)?.length ?? 0) < 10) continue;
    compared++;
    if (norm(s.text) !== norm(f.text)) {
      differ++;
      // عيّنة أول فرق: المخزَّن مقابل الحالي (فارغ الحالي ⇒ صفحة تُعدّ الآن فاسدة)
      if (!sample) sample = ` · ص${f.pageNumber}: المخزَّن «${s.text.replace(/\s+/g, " ").slice(0, 40)}» ↔ الحالي «${f.text.replace(/\s+/g, " ").slice(0, 40)}»`;
    }
  }
  if (compared > 0 && differ / compared > 0.05) issues.push({ code: "STORED_TEXT_DRIFT", severity: "warn", detail: `${differ}/${compared}${sample}` });
  return issues;
}

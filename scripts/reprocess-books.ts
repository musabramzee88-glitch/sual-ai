/**
 * إعادة معالجة الكتب من سطر الأوامر، مستقلة عن خادم الويب (لا تموت إن أُعيد تشغيل الخادم):
 *   npm run books:reprocess                    (المتعثرة: عالقة بلا نبض، موقوفة، NEEDS_OCR، فاشلة الاستخراج)
 *   npm run books:reprocess -- --damaged        (كتب طبقة نصها معطوبة/رموز تالفة/لغة لا تطابق المادة، أياً كانت حالتها)
 *   npm run books:reprocess -- --match lruqhtn  (أي كتاب يحوي اسمه/معرّفه هذا النص، أياً كانت حالته؛ يتكرر)
 *   npm run books:reprocess -- --no-ocr         (بلا OCR)
 * بعد كل كتاب تُطبع نتيجته. اترك النافذة مفتوحة؛ إن أُغلقت أعد الأمر وسيكمل من المتبقي.
 */
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* لا .env */ }
}

async function main() {
  loadEnv();
  const { db } = await import("../src/server/db");
  const { processBook, STALE_MS } = await import("../src/server/books/service");
  const matches = process.argv.flatMap((a, i, all) => (a === "--match" && all[i + 1] ? [all[i + 1]] : []));
  const ocr = !process.argv.includes("--no-ocr");

  let damagedIds: string[] = [];
  if (process.argv.includes("--damaged")) {
    const { PrismaClient } = await import("@prisma/client");
    const { buildReport } = await import("../src/server/books/health");
    const { loadBookInputs } = await import("../src/server/books/health-data");
    const prisma = new PrismaClient();
    const rep = buildReport(await loadBookInputs(prisma, process.env.STORAGE_DIR || "./storage"));
    await prisma.$disconnect();
    const bad = new Set(["UNRELIABLE_TEXT_LAYER", "GARBAGE_CHARS", "LANGUAGE_MISMATCH"]);
    damagedIds = rep.books.filter((b) => b.issues.some((i) => bad.has(i.code))).map((b) => b.id);
  }
  const where = damagedIds.length
    ? { ownerId: null, id: { in: damagedIds } }
    : matches.length
    ? { ownerId: null, OR: matches.flatMap((m) => [{ id: { contains: m } }, { originalName: { contains: m } }]) }
    : { ownerId: null, OR: [{ status: "FAILED" as const, error: { in: ["NEEDS_OCR", "CANCELLED", "EXTRACT_FAILED"] } }, { status: "PROCESSING" as const, updatedAt: { lt: new Date(Date.now() - STALE_MS) } }] };
  const rows = await db.uploadedBook.findMany({ where, select: { id: true, originalName: true }, orderBy: { createdAt: "asc" } });
  // لعدّ الإحصاء للمطابقة تُستعمل بصمة الاسم؛ المعرّف الكامل لا يُطبع للمستخدم
  console.log(`سيُعالَج ${rows.length} كتاب${ocr ? "" : " (بلا OCR)"}`);

  const admin = await db.adminUser.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  const actor = admin ? { adminId: admin.id } : undefined; // بلا مدير: لا وضع تلقائي للكتب في مناهجها
  let okCount = 0;
  for (const [i, b] of rows.entries()) {
    const t0 = Date.now();
    try {
      const r = await processBook(b.id, { ocr, actor });
      if (r.ok) okCount++;
      console.log(`[${i + 1}/${rows.length}] ${b.originalName} — ${r.ok ? `ص ${r.pageCount}، نص ${r.textPages}، OCR ${r.ocrPages}` : `تخطّي (${r.code})`} · ${Math.round((Date.now() - t0) / 1000)}ث`);
    } catch (e) {
      console.log(`[${i + 1}/${rows.length}] ${b.originalName} — فشل: ${(e as Error).name}`);
    }
  }
  console.log(`انتهى: ${okCount}/${rows.length}`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

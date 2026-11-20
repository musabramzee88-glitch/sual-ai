/**
 * يقترح فصول المناهج من صفحة «المحتويات» في كتابها المربوط، ويتحقق من أرقام الصفحات بمطابقة العناوين.
 *   npm run books:chapters             (عرض فقط: ما سيُقترح لكل منهج بلا فصول)
 *   npm run books:chapters -- --apply  (يحفظ المقترح الموثوق في المنهج؛ كل حفظ يُسجَّل في التدقيق)
 *   npm run books:chapters -- --debug نص   (يطبع أول 10 صفحات من كتاب بعينه لفحص شكل الفهرس)
 *   npm run books:chapters -- --clear نص   (يمسح فصول منهج كتاب بعينه)
 * يتجاوز المناهج التي فيها فصول أصلاً، والتي فيها أكثر من كتاب. ما لم يتحقق منه لا يقترحه (راجعه يدوياً).
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
  const apply = process.argv.includes("--apply");
  const { db } = await import("../src/server/db");
  const { proposeChapters } = await import("../src/server/books/toc");
  const { replaceChapters } = await import("../src/server/admin/curriculum");
  const admin = await db.adminUser.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if ((apply || process.argv.includes("--clear")) && !admin) { console.error("لا يوجد مدير فعّال"); process.exitCode = 1; return; }

  const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
  const dbg = arg("debug"), clr = arg("clear");
  if (dbg || clr) {
    const key = (dbg ?? clr)!;
    const hits = await db.uploadedBook.findMany({ where: { ownerId: null, OR: [{ id: { contains: key } }, { originalName: { contains: key } }] }, select: { id: true, originalName: true, curriculumId: true } });
    if (hits.length !== 1) { console.log(hits.length === 0 ? "لا كتاب بهذا الاسم" : `${hits.length} كتب تطابق، دقّق النص`); await db.$disconnect(); return; }
    if (dbg) {
      const pgs = await db.bookPage.findMany({ where: { bookId: hits[0].id, pageNumber: { lte: 10 } }, select: { pageNumber: true, text: true }, orderBy: { pageNumber: "asc" } });
      for (const p of pgs) console.log(`\n===== صفحة ${p.pageNumber} =====\n${p.text.slice(0, 700)}`);
    } else if (hits[0].curriculumId && admin) {
      const r = await replaceChapters({ adminId: admin.id }, hits[0].curriculumId, { chapters: [] });
      console.log(`${hits[0].originalName}: ${r.ok ? "مُسحت الفصول ✓" : `تعذّر: ${r.code}`}`);
    }
    await db.$disconnect();
    return;
  }
  const books = await db.uploadedBook.findMany({
    where: { ownerId: null, status: "READY", curriculumId: { not: null }, curriculum: { chapters: { none: {} } } },
    select: { id: true, originalName: true, pageCount: true, curriculumId: true },
    orderBy: { createdAt: "asc" },
  });
  const perCur = new Map<string, number>();
  for (const b of books) perCur.set(b.curriculumId!, (perCur.get(b.curriculumId!) ?? 0) + 1);
  let found = 0, saved = 0, none = 0;
  for (const b of books) {
    if ((perCur.get(b.curriculumId!) ?? 0) > 1 || !b.pageCount) { console.log(`— ${b.originalName}: تُخطّي (أكثر من كتاب في المنهج)`); continue; }
    const pages = await db.bookPage.findMany({ where: { bookId: b.id }, select: { pageNumber: true, text: true }, orderBy: { pageNumber: "asc" } });
    const r = proposeChapters(pages, b.pageCount);
    if (!r) { none++; console.log(`✗ ${b.originalName}: لا فهرس موثوق (أدخل فصوله يدوياً)`); continue; }
    found++;
    console.log(`✓ ${b.originalName}: ${r.chapters.length} فصل (تحقق ${r.verified}/${r.total}، فرق الترقيم ${r.offset})`);
    for (const c of r.chapters) console.log(`    ${c.pageStart}–${c.pageEnd}  ${c.title}`);
    if (apply) {
      const res = await replaceChapters({ adminId: admin!.id }, b.curriculumId!, { chapters: r.chapters.map((c) => ({ title: c.title.slice(0, 200), pageStart: c.pageStart, pageEnd: c.pageEnd })) });
      if (res.ok) saved++; else console.log(`    تعذّر الحفظ: ${res.code}`);
    }
  }
  console.log(`\nمقترح: ${found} · بلا فهرس موثوق: ${none}${apply ? ` · محفوظ: ${saved}` : " (عرض فقط؛ أضف --apply للحفظ)"}`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

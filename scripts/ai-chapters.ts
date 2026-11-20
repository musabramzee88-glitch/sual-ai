/**
 * يكمل فصول المناهج بقراءة صفحة «المحتويات» بنموذج رؤية (Gemini، المستوى المجاني يكفي).
 *   npm run books:chapters:ai                (عرض فقط)
 *   npm run books:chapters:ai -- --apply     (يحفظ الموثوق عبر replaceChapters مع التدقيق)
 *   npm run books:chapters:ai -- --match نص  (كتب بعينها)
 *   npm run books:chapters:ai -- --retry     (يعيد سؤال الكتب التي فشلت سابقاً، مرة واحدة لكل كتاب)
 * لكل كتاب طلب واحد (حتى 6 صور). الرد يُحفظ في STORAGE_DIR/ai-cache فإعادة التشغيل (أو --apply بعد العرض) لا تستهلك الحصة.
 * عند انتهاء الحصة اليومية يتوقف، وأعد تشغيله غداً فيكمل الباقي.
 */
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* لا .env */ }
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const matches = process.argv.flatMap((a, i, all) => (a === "--match" && all[i + 1] ? [all[i + 1]] : []));
  const { db } = await import("../src/server/db");
  const { readTocWithVision } = await import("../src/server/books/toc-vision");
  const retry = process.argv.includes("--retry");
  const { replaceChapters } = await import("../src/server/admin/curriculum");
  const { AiError } = await import("../src/server/ai/gemini");
  const admin = await db.adminUser.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (apply && !admin) { console.error("لا يوجد مدير فعّال"); process.exitCode = 1; return; }

  const books = await db.uploadedBook.findMany({
    where: {
      ownerId: null, status: "READY", curriculumId: { not: null }, curriculum: { chapters: { none: {} } },
      ...(matches.length ? { OR: matches.flatMap((m) => [{ id: { contains: m } }, { originalName: { contains: m } }]) } : {}),
    },
    select: { id: true, originalName: true, curriculumId: true },
    orderBy: { createdAt: "asc" },
  });
  const perCur = new Map<string, number>();
  for (const b of books) perCur.set(b.curriculumId!, (perCur.get(b.curriculumId!) ?? 0) + 1);
  let ok = 0, fail = 0, saved = 0;
  for (const [i, b] of books.entries()) {
    const tag = `[${i + 1}/${books.length}] ${b.originalName}`;
    if ((perCur.get(b.curriculumId!) ?? 0) > 1) { console.log(`— ${tag}: تُخطّي (أكثر من كتاب في المنهج)`); continue; }
    try {
      let r = await readTocWithVision(b.id);
      // رد قديم بلا أرقام الصفحات المطبوعة وتعذّر التحقق منه: سؤال جديد (يستهلك طلباً واحداً)
      if (!r.result && retry && r.cached) r = await readTocWithVision(b.id, { refresh: true });
      if (!r.result) {
        fail++;
        console.log(`✗ ${tag}: ${r.isContents ? `قُرئ الفهرس (${r.entries} بنداً) لكن تعذّر التحقق من صفحاته` : "لم يُعثر على صفحة محتويات في الصفحات المرسلة"} (ص ${r.sentPages.join("،")})`);
        continue;
      }
      ok++;
      const how = r.result.method === "printed" ? "أرقام الصفحات المطبوعة على الصور" : r.result.method === "footer" ? `أرقام ذيل الصفحات ${r.result.verified}%` : r.result.method === "numbers" ? `مطابقة العناوين ${r.result.verified}/${r.result.total}` : `بحث العناوين ${r.result.verified}/${r.result.total}`;
      console.log(`✓ ${tag}: ${r.result.chapters.length} فصل (${how}${r.result.offset !== null ? `، فرق الترقيم ${r.result.offset}` : ""})${r.cached ? " [محفوظ]" : ""}`);
      for (const c of r.result.chapters) console.log(`    ${c.pageStart}–${c.pageEnd}  ${c.title}`);
      if (apply) {
        const res = await replaceChapters({ adminId: admin!.id }, b.curriculumId!, { chapters: r.result.chapters.map((c) => ({ title: c.title, pageStart: c.pageStart, pageEnd: c.pageEnd })) });
        if (res.ok) saved++; else console.log(`    تعذّر الحفظ: ${res.code}`);
      }
    } catch (e) {
      if (e instanceof AiError && (e.code === "QUOTA" || e.code === "NO_KEY")) {
        console.log(`\n⏸ ${e.code === "NO_KEY" ? "GEMINI_API_KEY غير معرّف في .env" : `انتهت الحصة: ${e.message}`}\nأعد تشغيل الأمر لاحقاً فيكمل من حيث توقف.`);
        break;
      }
      fail++;
      console.log(`✗ ${tag}: خطأ (${(e as Error).message.slice(0, 160)})`);
    }
  }
  console.log(`\nمقترح: ${ok} · تعذّر: ${fail}${apply ? ` · محفوظ: ${saved}` : " (عرض فقط؛ أضف --apply للحفظ)"}`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

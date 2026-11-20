/**
 * يصحّح الكتب المؤكَّدة التي يخالف غلافُها (بثقة عالية) منهجها المربوط: الصف أو المادة أو النوع أو الجزء.
 *   npm run books:fix-placements            (ينفّذ ويطبع كل تغيير؛ كل تغيير يُسجَّل في سجل التدقيق)
 *   npm run books:fix-placements -- --dry   (يعرض ما سيتغيّر دون تنفيذ)
 *   npm run books:fix-placements -- --set yfgelsi:1 --set ak41xy4:1   (يضع جزء كتاب بعينه: جزء من المعرّف أو الاسم ثم رقم الجزء 0–5)
 * لا يلمس كتاباً غلافه غير واثق، ولا يختار جزءاً بالتخمين، ولا ينقل كتاباً إلى منهج فيه كتاب آخر.
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
  const dry = process.argv.includes("--dry");
  const { db } = await import("../src/server/db");
  const { placeBook } = await import("../src/server/books/placement");
  const admin = await db.adminUser.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (!admin) { console.error("لا يوجد مدير فعّال"); process.exitCode = 1; return; }

  const books = await db.uploadedBook.findMany({
    where: { ownerId: null, curriculumId: { not: null } },
    select: { id: true, originalName: true, detected: true, curriculum: { select: { kind: true, part: true, track: { select: { code: true } }, grade: { select: { code: true } }, subject: { select: { code: true } } } } },
  });
  let changed = 0;
  const sets = process.argv.flatMap((a, i, all) => (a === "--set" && all[i + 1] ? [all[i + 1]] : []));
  if (sets.length) {
    for (const sp of sets) {
      const m = /^(.+):([0-5])$/.exec(sp);
      if (!m) { console.log(`صيغة خاطئة: ${sp} (المطلوب نص:رقم)`); continue; }
      const hits = books.filter((b) => b.id.includes(m[1]) || b.originalName.includes(m[1]));
      if (hits.length !== 1) { console.log(`«${m[1]}»: ${hits.length === 0 ? "لا كتاب بهذا الاسم" : `${hits.length} كتب تطابق، دقّق النص`}`); continue; }
      const b = hits[0], c = b.curriculum!;
      const occupied = await db.uploadedBook.count({ where: { curriculum: { kind: c.kind, part: Number(m[2]), grade: { code: c.grade.code }, subject: { code: c.subject.code }, track: { code: c.track.code } }, id: { not: b.id } } });
      if (occupied > 0) { console.log(`${b.originalName}: الجزء ${m[2]} مشغول بكتاب آخر، لم يُغيَّر`); continue; }
      const r = await placeBook({ adminId: admin.id }, b.id, { trackCode: c.track.code, gradeCode: c.grade.code, subjectCode: c.subject.code, kind: c.kind, part: Number(m[2]) }, "confirm");
      console.log(`${b.originalName}: الجزء ${c.part}→${m[2]} ${r.ok ? "✓" : `تعذّر: ${r.code}`}`);
    }
    await db.$disconnect();
    return;
  }
  for (const b of books) {
    const d = b.detected as { gradeCode?: string | null; subjectCode?: string | null; kind?: "TEXTBOOK" | "EXERCISES" | "ACTIVITY"; part?: number | null; confidence?: string } | null;
    const c = b.curriculum;
    if (!d || d.confidence !== "high" || !c || !d.gradeCode || !d.subjectCode) continue;
    // النوع: الغلاف يغلب فقط إن حدّد نوعاً غير الكتاب العادي؛ الجزء: فقط إن ذكره الغلاف صراحةً
    const next = {
      trackCode: c.track.code,
      gradeCode: d.gradeCode,
      subjectCode: d.subjectCode,
      kind: d.kind && d.kind !== "TEXTBOOK" ? d.kind : c.kind,
      part: d.part ? d.part : c.part,
    };
    const diffs = [
      next.gradeCode !== c.grade.code && `الصف ${c.grade.code}→${next.gradeCode}`,
      next.subjectCode !== c.subject.code && `المادة ${c.subject.code}→${next.subjectCode}`,
      next.kind !== c.kind && `النوع ${c.kind}→${next.kind}`,
      next.part !== c.part && `الجزء ${c.part}→${next.part}`,
    ].filter(Boolean);
    if (diffs.length === 0) continue;
    const occupied = await db.uploadedBook.count({ where: { curriculum: { kind: next.kind, part: next.part, grade: { code: next.gradeCode }, subject: { code: next.subjectCode }, track: { code: next.trackCode } }, id: { not: b.id } } });
    if (occupied > 0) { console.log(`تخطّي ${b.originalName}: المكان الجديد (${diffs.join("، ")}) مشغول بكتاب آخر — حدّده بنفسك`); continue; }
    console.log(`${dry ? "[تجربة] " : ""}${b.originalName}: ${diffs.join("، ")}`);
    if (dry) continue;
    const r = await placeBook({ adminId: admin.id }, b.id, next, "confirm");
    if (r.ok) changed++;
    else console.log(`   تعذّر: ${r.code}`);
  }
  console.log(dry ? "انتهت التجربة" : `تم تصحيح ${changed} كتاب`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

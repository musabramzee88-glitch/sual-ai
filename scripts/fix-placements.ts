/**
 * يصحّح الكتب المؤكَّدة التي يخالف غلافُها (بثقة عالية) منهجها المربوط: الصف أو المادة أو النوع أو الجزء.
 *   npm run books:fix-placements            (ينفّذ ويطبع كل تغيير؛ كل تغيير يُسجَّل في سجل التدقيق)
 *   npm run books:fix-placements -- --dry   (يعرض ما سيتغيّر دون تنفيذ)
 * لا يلمس كتاباً غلافه غير واثق، ولا يختار جزءاً بالتخمين.
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

// يسحب آخر تحديثات المستودع وينسخ ملفات تطبيق Flutter (mobile/) إلى مجلد نسختك، كل دقيقة.
//   node scripts/sync-mobile.mjs "C:\Users\...\Desktop\sual_app"        (مرة واحدة + تكرار كل دقيقة)
//   node scripts/sync-mobile.mjs "المجلد" --once                        (مرة واحدة فقط)
// ينسخ الملفات التي يتتبعها git فقط (لا build ولا .dart_tool ولا local.properties)، ولا يحذف شيئاً من نسختك.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] && !process.argv[2].startsWith("--") ? resolve(process.argv[2]) : null;
const once = process.argv.includes("--once");
if (!target) { console.error("اكتب مجلد نسخة التطبيق، مثلاً: node scripts/sync-mobile.mjs \"C:\\Users\\أنت\\Desktop\\sual_app\""); process.exit(1); }
if (!existsSync(join(target, "pubspec.yaml"))) { console.error(`المجلد ${target} ليس مشروع Flutter (لا يوجد pubspec.yaml). تأكد من المسار.`); process.exit(1); }

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
const same = (a, b) => existsSync(b) && readFileSync(a).equals(readFileSync(b));

function syncOnce() {
  try {
    if (git("status", "--porcelain")) console.log("تنبيه: عندك تعديلات محلية بالمستودع، لن أسحب فوقها.");
    else git("pull", "--ff-only");
  } catch (e) { console.log("تعذّر السحب (الإنترنت؟):", String(e.message).split("\n")[0]); }
  let copied = 0;
  for (const f of git("ls-files", "mobile").split("\n").filter(Boolean)) {
    const rel = f.replace(/^mobile\//, "");
    const from = join(root, f), to = join(target, rel);
    if (same(from, to)) continue;
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    copied++;
    console.log("نُسخ:", rel);
  }
  console.log(copied ? `تم نسخ ${copied} ملف. أعد تشغيل التطبيق (flutter run) ليظهر.` : "كل شيء محدّث.");
}

syncOnce();
if (!once) setInterval(syncOnce, 60_000);

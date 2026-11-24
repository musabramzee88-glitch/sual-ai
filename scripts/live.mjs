#!/usr/bin/env node
/**
 * تشغيل الموقع مع التحديث التلقائي (npm run live):
 * - يشغّل الخادم (next start) ويتحقق كل دقيقة من GitHub على الفرع الحالي.
 * - عند وجود تحديث: يسحبه، ويبني النسخة الجديدة في مجلد بديل والقديمة ما زالت تعمل، ثم يبدّل إليها (انقطاع ثانيتين تقريباً).
 *   فيكفي المستخدمَ تحديث الصفحة في المتصفح.
 * - تغيّر المكتبات (package-lock) أو قاعدة البيانات (prisma/): يوقف الخادم أولاً لأن ويندوز يقفل ملفات المكتبات أثناء التشغيل،
 *   ثم npm install / prisma migrate deploy / prisma generate، ثم يبني ويشغّل.
 * - لا يمسّ تعديلاتك المحلية: إن كان في الملفات المتتبَّعة تعديل محلي أو commits محلية يتوقف عن التحديث ويخبرك.
 * - فشل البناء يُبقي النسخة القديمة تعمل ولا يعيد المحاولة على التحديث نفسه.
 * متغيرات: PORT (3000)، LIVE_INTERVAL بالثواني (60)، BIND_HOST (على الخادم 127.0.0.1 فلا يُفتح الموقع إلا عبر nginx).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { lastBackup } from "./backup.mjs";

const win = process.platform === "win32";
const PORT = process.env.PORT || "3000";
const INTERVAL = Math.max(10, Number(process.env.LIVE_INTERVAL || 60)) * 1000;
const DIRS = [".next-live-a", ".next-live-b"];
const STATE = ".live-state.json";

const log = (...a) => console.log(`[تحديث ${new Date().toLocaleTimeString("en-GB")}]`, ...a);
const run = (cmd, args, env = {}) => spawnSync(cmd, args, { stdio: "inherit", shell: win, env: { ...process.env, ...env } }).status === 0;
const out = (cmd, args) => (spawnSync(cmd, args, { encoding: "utf8", shell: win }).stdout ?? "").trim();
const readState = () => { try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return {}; } };
const saveState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2));

let state = { dist: DIRS[0], builtCommit: null, failedCommit: null, ...readState() };
let server = null;
let stopping = false;
let busy = false;

function startServer() {
  log(`تشغيل الموقع على http://localhost:${PORT}`);
  server = spawn("npx", ["next", "start", "-p", PORT, ...(process.env.BIND_HOST ? ["-H", process.env.BIND_HOST] : [])], { stdio: "inherit", shell: win, detached: !win, env: { ...process.env, NEXT_DIST_DIR: state.dist } });
  const me = server;
  me.on("exit", (code) => {
    if (server !== me || stopping) return;
    log(`توقف الخادم (رمز ${code})، إعادة التشغيل بعد 3 ثوانٍ…`);
    setTimeout(() => { if (server === me && !stopping) startServer(); }, 3000);
  });
}

/** يشغّل الخادم فقط إن وُجدت نسخة مبنية (لا حلقة تشغيل فاشلة) */
function startIfBuilt() {
  if (server) return;
  if (existsSync(`${state.dist}/BUILD_ID`)) startServer();
  else log("لا توجد نسخة مبنية بعد؛ أصلح الخطأ أعلاه وسأعيد المحاولة مع التحديث القادم (أو أعد تشغيل npm run live).");
}

function stopServer() {
  return new Promise((resolve) => {
    const s = server;
    server = null;
    if (!s || s.exitCode !== null) return resolve();
    s.once("exit", () => resolve());
    if (win) spawnSync("taskkill", ["/pid", String(s.pid), "/T", "/F"], { stdio: "ignore" });
    else { try { process.kill(-s.pid, "SIGTERM"); } catch { s.kill("SIGTERM"); } }
    setTimeout(resolve, 8000);
  });
}

/** يبني في المجلد المطلوب؛ Next قد يعيد كتابة tsconfig.json/next-env.d.ts لمجلد البناء البديل فتُعاد كما في git (لا تُعدّ تعديلاً محلياً) */
const build = (dist) => {
  log(`بناء النسخة في ${dist}…`);
  const ok = run("npx", ["next", "build"], { NEXT_DIST_DIR: dist });
  for (const f of ["tsconfig.json", "next-env.d.ts"]) if (spawnSync("git", ["diff", "--quiet", "--", f], { shell: win }).status === 1) run("git", ["checkout", "--quiet", "--", f]);
  return ok;
};
const prepareDb = () => run("npx", ["prisma", "migrate", "deploy"]) && run("npx", ["prisma", "generate"]);

/** يسحب التحديث إن وُجد؛ يعيد قائمة الملفات المتغيرة أو null */
function pull(branch) {
  if (!run("git", ["fetch", "--quiet", "origin", branch])) { log("تعذّر الاتصال بـ GitHub، سأحاول لاحقاً."); return null; }
  const head = out("git", ["rev-parse", "HEAD"]);
  const remote = out("git", ["rev-parse", `origin/${branch}`]);
  if (!remote || head === remote) return null;
  if (spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", `origin/${branch}`], { shell: win }).status !== 0) {
    log("في النسخة المحلية commits غير موجودة على GitHub؛ لن أحدّث تلقائياً حتى لا أفقدها.");
    return null;
  }
  if (out("git", ["status", "--porcelain", "--untracked-files=no"])) {
    log("في ملفات المشروع تعديلات محلية؛ لن أحدّث تلقائياً حتى لا أمسحها. (git status لمعرفتها)");
    return null;
  }
  const changed = out("git", ["diff", "--name-only", "HEAD", `origin/${branch}`]).split(/\r?\n/).filter(Boolean);
  if (!run("git", ["merge", "--ff-only", "--quiet", `origin/${branch}`])) { log("تعذّر سحب التحديث."); return null; }
  log(`وصل تحديث (${changed.length} ملفاً).`);
  return changed;
}

async function update(branch, first = false) {
  if (busy) return;
  busy = true;
  try {
    const changed = pull(branch) ?? [];
    const commit = out("git", ["rev-parse", "HEAD"]);
    const deps = changed.some((f) => /^package(-lock)?\.json$/.test(f)) || !existsSync("node_modules");
    const db = first || changed.some((f) => f.startsWith("prisma/"));
    const needsBuild = state.builtCommit !== commit || !existsSync(`${state.dist}/BUILD_ID`);
    if (!needsBuild && !deps && !db) return;
    if (!first && commit === state.failedCommit) return; // فشل بناؤه سابقاً: ننتظر تحديثاً أحدث
    if (deps || db) {
      // ملفات المكتبات ومحرّك Prisma مقفلة أثناء تشغيل الخادم على ويندوز
      if (server) { log("إيقاف الموقع مؤقتاً لتحديث المكتبات/قاعدة البيانات…"); await stopServer(); }
      if (deps && !run("npm", ["install", "--no-audit", "--no-fund"])) { log("فشل npm install."); state.failedCommit = commit; saveState(state); startIfBuilt(); return; }
      if (!prepareDb()) { log("فشل تحديث قاعدة البيانات (migrate/generate). تأكد أن PostgreSQL يعمل."); state.failedCommit = commit; saveState(state); startIfBuilt(); return; }
    }
    if (needsBuild || deps || db) {
      const target = server ? DIRS.find((d) => d !== state.dist) : state.dist;
      if (!build(target)) {
        log("فشل البناء؛ النسخة السابقة باقية تعمل. سأنتظر التحديث التالي.");
        state.failedCommit = commit; saveState(state);
        startIfBuilt();
        return;
      }
      if (server) await stopServer();
      state = { ...state, dist: target, builtCommit: commit, failedCommit: null };
      saveState(state);
    }
    if (!server) startServer();
    if (!first) log("✔ تم التحديث — أعد تحميل الصفحة في المتصفح.");
  } finally {
    busy = false;
  }
}

/** نسخة احتياطية يومية في عملية منفصلة (لا توقف الموقع): عند التشغيل إن مضى على آخر نسخة ناجحة 20 ساعة، ثم كل ساعة يُفحص */
let backingUp = false;
function dailyBackup() {
  if (backingUp) return;
  const { lastOk } = lastBackup();
  if (lastOk && Date.now() - new Date(lastOk.at).getTime() < 20 * 3600 * 1000) return;
  backingUp = true;
  log("نسخة احتياطية يومية …");
  const p = spawn(process.execPath, ["scripts/backup.mjs"], { stdio: "inherit" });
  p.on("exit", (code) => { backingUp = false; if (code !== 0) log("تعذّرت النسخة الاحتياطية (التفاصيل أعلاه)؛ سأحاول بعد ساعة."); });
}

async function main() {
  const branch = out("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch || branch === "HEAD") { console.error("لست على فرع git."); process.exit(1); }
  log(`الفرع: ${branch} — التحقق من التحديثات كل ${INTERVAL / 1000} ثانية. أغلق النافذة أو اضغط Ctrl+C للإيقاف.`);
  await update(branch, true);
  startIfBuilt();
  setInterval(() => { update(branch).catch((e) => log("خطأ:", e.message)); }, INTERVAL);
  setTimeout(dailyBackup, 30_000);
  setInterval(dailyBackup, 3600 * 1000);
  const quit = async () => { stopping = true; await stopServer(); process.exit(0); };
  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
}

main().catch((e) => { console.error(e); process.exit(1); });

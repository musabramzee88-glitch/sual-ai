#!/usr/bin/env node
/**
 * النسخ الاحتياطي والاسترجاع (بلا مكتبات إضافية):
 *   npm run backup                  نسخة الآن: قاعدة البيانات (pg_dump بصيغة custom) + ملفات التخزين (نسخ تزايدي)
 *   npm run backup -- list          النسخ الموجودة
 *   npm run restore -- --yes [ملف]   استرجاع (آخر نسخة افتراضياً). يمسح البيانات الحالية ويضع النسخة مكانها.
 *
 * المجلد: BACKUP_DIR في .env (الافتراضي ./backups). يُستحسن أن يكون على قرص آخر أو مجلد سحابي (OneDrive) ليبقى إن تلف الجهاز.
 * تُحفظ آخر BACKUP_KEEP نسخة لقاعدة البيانات (14 افتراضياً)؛ ملفات الكتب مرآة واحدة لا يُحذف منها شيء.
 * كل نسخة تُفحص بعد إنشائها (pg_restore --list) وتُسجَّل في backup-log.json (تقرؤه صفحة «حالة النظام»).
 * كلمة مرور قاعدة البيانات تُمرَّر بمتغير PGPASSWORD لا في سطر الأوامر، ولا تُطبع.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const win = process.platform === "win32";

/** .env بسيط (مع إزالة BOM ودعم القيم بين علامتي تنصيص) */
export function loadEnv(file = ".env") {
  const env = {};
  if (!existsSync(file)) return env;
  for (const raw of readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(raw);
    if (!m) continue;
    let v = m[2];
    if (/^".*"$|^'.*'$/.test(v)) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const fileEnv = loadEnv();
const cfg = (k, d) => process.env[k] ?? fileEnv[k] ?? d;
export const BACKUP_DIR = path.resolve(cfg("BACKUP_DIR", "./backups") || "./backups");
const STORAGE_DIR = path.resolve(cfg("STORAGE_DIR", "./storage") || "./storage");
const KEEP = Math.max(1, Number(cfg("BACKUP_KEEP", "14")) || 14);
const LOG = path.join(BACKUP_DIR, "backup-log.json");

/** مكان أداة PostgreSQL: PG_BIN، ثم PATH، ثم مجلدات التثبيت المعتادة على ويندوز (أحدث نسخة) */
export function pgTool(name) {
  const exe = win ? `${name}.exe` : name;
  const bin = cfg("PG_BIN", "");
  if (bin && existsSync(path.join(bin, exe))) return path.join(bin, exe);
  if (spawnSync(name, ["--version"], { shell: win, stdio: "ignore" }).status === 0) return name;
  if (win) {
    for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean)) {
      const root = path.join(base, "PostgreSQL");
      if (!existsSync(root)) continue;
      const vers = readdirSync(root).filter((v) => /^\d+(\.\d+)?$/.test(v)).sort((a, b) => Number(b) - Number(a));
      for (const v of vers) if (existsSync(path.join(root, v, "bin", exe))) return path.join(root, v, "bin", exe);
    }
  }
  return null;
}

/** رابط قاعدة البيانات → وسائط الاتصال + كلمة المرور في البيئة (لا تظهر في قائمة العمليات) */
export function connArgs(url = cfg("DATABASE_URL", "")) {
  if (!url) throw new Error("DATABASE_URL غير موجود في .env");
  const u = new URL(url);
  const args = ["-h", u.hostname || "localhost", "-p", u.port || "5432", "-U", decodeURIComponent(u.username), "-d", decodeURIComponent(u.pathname.replace(/^\//, ""))];
  return { args, env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password) } };
}

/** اسم فريد للنسخة حتى الثانية؛ ولو تكرر في الثانية نفسها يُضاف رقم (لا تُكتب نسخة فوق أخرى أبداً) */
function dumpName(dir) {
  const base = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15); // 20261123_221530
  let name = `${base}.dump`;
  for (let i = 2; existsSync(path.join(dir, name)); i++) name = `${base}-${i}.dump`;
  return name;
}
const readLog = () => { try { return JSON.parse(readFileSync(LOG, "utf8")); } catch { return []; } };
const writeLog = (rows) => writeFileSync(LOG, JSON.stringify(rows.slice(-100), null, 2));

/** نسخ تزايدي: ملف جديد أو تغيّر حجمه/وقته فقط. لا يحذف من الوجهة (الحذف بالخطأ لا يُنسخ). */
export function mirror(src, dst) {
  let copied = 0, bytes = 0, files = 0;
  if (!existsSync(src)) return { copied, bytes, files };
  const walk = (s, d) => {
    mkdirSync(d, { recursive: true });
    for (const name of readdirSync(s)) {
      const sp = path.join(s, name), dp = path.join(d, name);
      const st = statSync(sp);
      if (st.isDirectory()) { walk(sp, dp); continue; }
      if (!st.isFile()) continue;
      files++;
      const ds = existsSync(dp) ? statSync(dp) : null;
      if (ds && ds.size === st.size && Math.abs(ds.mtimeMs - st.mtimeMs) < 2000) continue;
      copyFileSync(sp, dp);
      utimesSync(dp, st.atime, st.mtime);
      copied++; bytes += st.size;
    }
  };
  walk(src, dst);
  return { copied, bytes, files };
}

export function backup({ quiet = false } = {}) {
  const say = (...a) => { if (!quiet) console.log(...a); };
  const started = Date.now();
  const row = { at: new Date().toISOString(), ok: false };
  try {
    const pgDump = pgTool("pg_dump"), pgRestore = pgTool("pg_restore");
    if (!pgDump || !pgRestore) throw new Error("لم أجد pg_dump. ثبّت PostgreSQL أو ضع مجلد bin في PG_BIN داخل .env");
    mkdirSync(path.join(BACKUP_DIR, "db"), { recursive: true });
    const file = path.join(BACKUP_DIR, "db", dumpName(path.join(BACKUP_DIR, "db")));
    const { args, env } = connArgs();
    say(`نسخ قاعدة البيانات إلى ${file} …`);
    const d = spawnSync(pgDump, [...args, "--format=custom", "--no-owner", "--no-privileges", "--file", file], { env, stdio: ["ignore", "inherit", "pipe"], encoding: "utf8" });
    if (d.status !== 0) throw new Error(`pg_dump فشل: ${(d.stderr || "").trim().split("\n")[0]}`);
    // فحص النسخة: يجب أن تُقرأ قائمة محتوياتها وفيها جداول المشروع
    const l = spawnSync(pgRestore, ["--list", file], { encoding: "utf8" });
    if (l.status !== 0 || !/TABLE DATA public "?User"?/.test(l.stdout)) throw new Error("النسخة الناتجة لا تُقرأ أو ناقصة");
    row.dbFile = path.relative(BACKUP_DIR, file);
    row.dbBytes = statSync(file).size;
    say("نسخ ملفات الكتب والصور (الجديد فقط) …");
    const m = mirror(STORAGE_DIR, path.join(BACKUP_DIR, "storage"));
    Object.assign(row, { storageFiles: m.files, storageCopied: m.copied, storageCopiedBytes: m.bytes });
    // التدوير: إبقاء آخر KEEP نسخة
    const dumps = readdirSync(path.join(BACKUP_DIR, "db")).filter((f) => f.endsWith(".dump")).sort();
    for (const old of dumps.slice(0, Math.max(0, dumps.length - KEEP))) rmSync(path.join(BACKUP_DIR, "db", old), { force: true });
    row.ok = true;
  } catch (e) {
    row.error = e.message;
  }
  row.ms = Date.now() - started;
  writeLog([...readLog(), row]);
  if (row.ok) say(`✔ تمت النسخة: قاعدة البيانات ${(row.dbBytes / 1024 / 1024).toFixed(1)}MB، ملفات ${row.storageFiles} (جديد ${row.storageCopied}) في ${(row.ms / 1000).toFixed(1)} ثانية.`);
  else console.error(`✘ فشل النسخ الاحتياطي: ${row.error}`);
  return row;
}

export function lastBackup() {
  const rows = readLog();
  return { last: rows.at(-1) ?? null, lastOk: [...rows].reverse().find((r) => r.ok) ?? null };
}

function list() {
  const dir = path.join(BACKUP_DIR, "db");
  const dumps = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".dump")).sort() : [];
  console.log(`المجلد: ${BACKUP_DIR}`);
  if (!dumps.length) return console.log("لا توجد نسخ بعد.");
  for (const f of dumps) console.log(`  ${f}  ${(statSync(path.join(dir, f)).size / 1024 / 1024).toFixed(1)}MB`);
}

function restore(argv) {
  const yes = argv.includes("--yes");
  const pick = argv.find((a) => !a.startsWith("--"));
  const dir = path.join(BACKUP_DIR, "db");
  const dumps = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".dump")).sort() : [];
  const file = pick ? path.resolve(pick.includes(path.sep) || pick.includes("/") ? pick : path.join(dir, pick)) : dumps.length ? path.join(dir, dumps.at(-1)) : null;
  if (!file || !existsSync(file)) { console.error("لا توجد نسخة للاسترجاع. (npm run backup -- list)"); process.exit(1); }
  if (!yes) {
    console.log(`سيُسترجَع: ${file}\nهذا يمسح البيانات الحالية ويضع النسخة مكانها. أغلق نافذة الموقع (start-sual) أولاً، ثم أعد الأمر مع --yes:\n  npm run restore -- --yes ${path.basename(file)}`);
    process.exit(2);
  }
  const pgRestore = pgTool("pg_restore");
  if (!pgRestore) { console.error("لم أجد pg_restore (PG_BIN في .env)."); process.exit(1); }
  // نسخة أمان من الحال الحالي قبل الاسترجاع (لا تضيع إن كان الاسترجاع خطأً)
  console.log("نسخة أمان من البيانات الحالية قبل الاسترجاع …");
  const safety = backup({ quiet: true });
  if (!safety.ok) { console.error(`لم أستطع أخذ نسخة أمان (${safety.error})، أوقفت الاسترجاع.`); process.exit(1); }
  const { args, env } = connArgs();
  console.log(`استرجاع ${path.basename(file)} …`);
  const r = spawnSync(pgRestore, [...args, "--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", file], { env, stdio: "inherit" });
  if (r.status !== 0) { console.error(`فشل الاسترجاع. البيانات السابقة محفوظة في ${safety.dbFile}.`); process.exit(1); }
  const m = mirror(path.join(BACKUP_DIR, "storage"), STORAGE_DIR);
  console.log(`✔ تم الاسترجاع (ملفات أُعيدت: ${m.copied}). شغّل الموقع من جديد.`);
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "list") list();
  else if (cmd === "restore") restore(rest);
  else process.exit(backup().ok ? 0 : 1);
}

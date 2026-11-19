/**
 * فحص سلامة كتب المكتبة من سطر الأوامر على جهازك:
 *   npm run books:check            (تقرير نصي يمكن نسخه وإرساله)
 *   npm run books:check -- --json  (JSON)
 * يقرأ DATABASE_URL و STORAGE_DIR من .env. لا يغيّر شيئاً (قراءة فقط).
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { buildReport, formatReport } from "../src/server/books/health";
import { loadBookInputs } from "../src/server/books/health-data";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* لا .env: نعتمد على متغيرات البيئة */ }
}

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  try {
    const report = buildReport(await loadBookInputs(prisma, process.env.STORAGE_DIR || "./storage"));
    console.log(process.argv.includes("--json") ? JSON.stringify(report, null, 2) : formatReport(report));
    process.exitCode = report.summary.error > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(String(e.message ?? e)); process.exit(2); });

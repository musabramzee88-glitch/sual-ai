import "server-only";
import { readdir, readFile, statfs } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { env } from "../env";
import { htmlToPdf } from "../exams/pdf";
import { evaluate, overall, type Raw } from "./status-rules";

/** يجمع قياسات «حالة النظام» (كل قياس مستقل: فشل أحدها لا يُسقط الصفحة) ثم يقيّمها بقواعد status-rules */
export async function systemStatus() {
  const now = Date.now();
  const since = new Date(now - 24 * 3600 * 1000);
  const timed = async <T,>(fn: () => Promise<T>) => { const t0 = Date.now(); try { await fn(); return { ok: true, ms: Date.now() - t0 }; } catch (e) { return { ok: false, ms: Date.now() - t0, error: (e as Error).message.split("\n")[0].slice(0, 160) }; } };

  const dbCheck = await timed(() => db.$queryRaw`SELECT 1`);
  const [files, applied] = await Promise.all([
    readdir(path.resolve("prisma/migrations"), { withFileTypes: true }).then((d) => d.filter((x) => x.isDirectory()).length).catch(() => 0),
    db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`.then((r) => Number(r[0]?.n ?? 0)).catch(() => 0),
  ]);
  const log = await readFile(path.join(path.resolve(env.BACKUP_DIR), "backup-log.json"), "utf8").then((s) => JSON.parse(s) as { at: string; ok: boolean; error?: string; dbBytes?: number }[]).catch(() => []);
  const lastOk = [...log].reverse().find((r) => r.ok) ?? null;
  const last = log.at(-1) ?? null;
  const disk = await statfs(path.resolve(env.STORAGE_DIR)).then((s) => Number(s.bavail) * Number(s.bsize)).catch(() => null);
  const pdf = await timed(() => Promise.race([htmlToPdf("<p>ok</p>", { pageNumbers: false, lang: "ar" }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 25000))]));
  const stuckBefore = new Date(now - 30 * 60 * 1000);
  const [failedJobs, lastJob, processing, failedBooks, stuck, failedExports] = await Promise.all([
    db.examGenerationJob.count({ where: { status: "FAILED", createdAt: { gte: since } } }).catch(() => 0),
    db.examGenerationJob.findFirst({ where: { status: "FAILED", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: { error: true } }).catch(() => null),
    db.uploadedBook.count({ where: { status: "PROCESSING" } }).catch(() => 0),
    db.uploadedBook.count({ where: { status: "FAILED" } }).catch(() => 0),
    db.uploadedBook.count({ where: { status: "PROCESSING", updatedAt: { lt: stuckBefore } } }).catch(() => 0),
    db.examExport.count({ where: { status: "FAILED", createdAt: { gte: since } } }).catch(() => 0),
  ]);
  const raw: Raw = {
    db: dbCheck, migrations: { files, applied },
    backup: { lastOkAt: lastOk?.at ?? null, lastAt: last?.at ?? null, lastError: last && !last.ok ? last.error ?? "خطأ" : null, dbBytes: lastOk?.dbBytes ?? null },
    disk: { freeBytes: disk }, pdf,
    ai: { keyConfigured: !!env.GEMINI_API_KEY, failed24h: failedJobs, lastError: lastJob?.error?.slice(0, 160) ?? null },
    books: { processing, failed: failedBooks, stuck }, exports: { failed24h: failedExports }, now,
  };
  const checks = evaluate(raw);
  const version = await readFile(".live-state.json", "utf8").then((s) => (JSON.parse(s).builtCommit as string | null)?.slice(0, 7) ?? null).catch(() => null);
  return { checks, overall: overall(checks), version, uptimeSec: Math.round(process.uptime()), checkedAt: new Date(now).toISOString() };
}

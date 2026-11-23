import { describe, expect, it } from "vitest";
import { evaluate, overall, type Raw } from "./status-rules";

const now = Date.parse("2026-11-23T12:00:00Z");
const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();
const healthy: Raw = {
  db: { ok: true, ms: 4 }, migrations: { files: 20, applied: 20 },
  backup: { lastOkAt: hoursAgo(3), lastAt: hoursAgo(3), lastError: null, dbBytes: 5 * 1024 * 1024 },
  disk: { freeBytes: 50 * 1024 ** 3 }, pdf: { ok: true, ms: 900 }, ai: { keyConfigured: true, failed24h: 0, lastError: null },
  books: { processing: 0, failed: 0, stuck: 0 }, exports: { failed24h: 0 }, now,
};
const level = (r: Raw, key: string) => evaluate(r).find((c) => c.key === key)!;

describe("system status rules", () => {
  it("a healthy system is all green", () => {
    const c = evaluate(healthy);
    expect(c.every((x) => x.level === "ok")).toBe(true);
    expect(overall(c)).toBe("ok");
    expect(level(healthy, "backup").value).toContain("3 ساعة");
  });
  it("backups: none = error, stale = warn then error, last attempt failed = warn with the reason", () => {
    expect(level({ ...healthy, backup: { lastOkAt: null, lastAt: null, lastError: null, dbBytes: null } }, "backup").level).toBe("error");
    expect(level({ ...healthy, backup: { ...healthy.backup, lastOkAt: hoursAgo(30), lastAt: hoursAgo(30) } }, "backup").level).toBe("warn");
    expect(level({ ...healthy, backup: { ...healthy.backup, lastOkAt: hoursAgo(60), lastAt: hoursAgo(60) } }, "backup").level).toBe("error");
    const failed = level({ ...healthy, backup: { ...healthy.backup, lastAt: hoursAgo(1), lastError: "pg_dump فشل" } }, "backup");
    expect(failed.level).toBe("warn");
    expect(failed.hint).toContain("pg_dump فشل");
  });
  it("database down, pending migrations and no PDF engine are errors with a hint", () => {
    expect(level({ ...healthy, db: { ok: false, ms: 0 } }, "db").level).toBe("error");
    const m = level({ ...healthy, migrations: { files: 22, applied: 20 } }, "migrations");
    expect([m.level, m.value]).toEqual(["error", "2 تحديث غير مطبَّق"]);
    const p = level({ ...healthy, pdf: { ok: false, ms: 10, error: "no usable Chromium" } }, "pdf");
    expect(p.level).toBe("error");
    expect(p.hint).toContain("CHROMIUM_PATH");
    expect(overall(evaluate({ ...healthy, db: { ok: false, ms: 0 } }))).toBe("error");
  });
  it("AI: missing key is an error; repeated failures warn and explain a used-up daily quota", () => {
    expect(level({ ...healthy, ai: { keyConfigured: false, failed24h: 0, lastError: null } }, "ai").level).toBe("error");
    const q = level({ ...healthy, ai: { keyConfigured: true, failed24h: 4, lastError: "AiError QUOTA" } }, "ai");
    expect(q.level).toBe("warn");
    expect(q.hint).toContain("الحصة اليومية");
  });
  it("low disk warns then errors; stuck books warn with the fix command", () => {
    expect(level({ ...healthy, disk: { freeBytes: 1024 ** 3 } }, "disk").level).toBe("warn");
    expect(level({ ...healthy, disk: { freeBytes: 100 * 1024 ** 2 } }, "disk").level).toBe("error");
    expect(evaluate({ ...healthy, disk: { freeBytes: null } }).some((c) => c.key === "disk")).toBe(false);
    const b = level({ ...healthy, books: { processing: 2, failed: 0, stuck: 1 } }, "books");
    expect(b.level).toBe("warn");
    expect(b.hint).toContain("books:reprocess");
    expect(overall(evaluate({ ...healthy, books: { processing: 0, failed: 1, stuck: 0 } }))).toBe("warn");
  });
});

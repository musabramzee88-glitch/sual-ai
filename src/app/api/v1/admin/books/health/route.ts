import { ok } from "@/server/http";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { adminRead } from "@/server/admin/route";
import { buildReport, formatReport } from "@/server/books/health";
import { loadBookInputs } from "@/server/books/health-data";

export const runtime = "nodejs";

/** تقرير فحص سلامة كتب المكتبة (قراءة فقط) */
export async function GET() {
  return adminRead("MANAGE_CURRICULUM", async () => {
    const report = buildReport(await loadBookInputs(db, env.STORAGE_DIR));
    return ok({ report, text: formatReport(report) });
  });
}

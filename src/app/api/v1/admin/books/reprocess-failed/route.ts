import { after } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { ok } from "@/server/http";
import { adminMutation } from "@/server/admin/route";
import { processMany, STALE_MS } from "@/server/books/service";

export const runtime = "nodejs";

/** يعيد معالجة كل الكتب المتعثرة: مصوَّرة لم تُقرأ، موقوفة، فاشلة القراءة، وعالقة بلا نبض (بالتتابع في الخلفية) */
export async function POST(req: Request) {
  return adminMutation(req, "MANAGE_CURRICULUM", z.object({}), async ({ actor }) => {
    const rows = await db.uploadedBook.findMany({ where: { ownerId: null, OR: [{ status: "FAILED", error: { in: ["NEEDS_OCR", "CANCELLED", "EXTRACT_FAILED"] } }, { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - STALE_MS) } }] }, select: { id: true }, orderBy: { createdAt: "asc" } });
    if (rows.length > 0) after(() => processMany(rows.map((r) => r.id), actor));
    return ok({ queued: rows.length });
  });
}

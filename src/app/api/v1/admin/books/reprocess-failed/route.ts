import { after } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { ok } from "@/server/http";
import { adminMutation } from "@/server/admin/route";
import { processMany } from "@/server/books/service";

export const runtime = "nodejs";

/** يعيد معالجة كل كتب المكتبة الفاشلة بسبب NEEDS_OCR (تُنفَّذ بالتتابع في الخلفية) */
export async function POST(req: Request) {
  return adminMutation(req, "MANAGE_CURRICULUM", z.object({}), async ({ actor }) => {
    const rows = await db.uploadedBook.findMany({ where: { ownerId: null, status: "FAILED", error: { in: ["NEEDS_OCR", "CANCELLED"] } }, select: { id: true }, orderBy: { createdAt: "asc" } });
    if (rows.length > 0) after(() => processMany(rows.map((r) => r.id), actor));
    return ok({ queued: rows.length });
  });
}

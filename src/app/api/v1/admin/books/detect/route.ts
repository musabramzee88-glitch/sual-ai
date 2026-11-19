import { after } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { ok } from "@/server/http";
import { adminMutation } from "@/server/admin/route";
import { detectMany } from "@/server/books/service";

export const runtime = "nodejs";

/** يتعرّف على الصف والمادة والنوع من غلاف الكتب غير المربوطة (force: حتى التي سبق التعرّف عليها) */
export async function POST(req: Request) {
  return adminMutation(req, "MANAGE_CURRICULUM", z.object({ force: z.boolean().optional() }), async ({ body }) => {
    const rows = await db.uploadedBook.findMany({
      where: { ownerId: null, curriculumId: null, status: { in: ["READY", "FAILED"] }, pageCount: { gt: 0 }, ...(body.force ? {} : { detected: { equals: undefined } }) },
      select: { id: true, detected: true }, orderBy: { originalName: "asc" },
    });
    const ids = rows.filter((r) => body.force || r.detected === null).map((r) => r.id);
    if (ids.length > 0) after(() => detectMany(ids));
    return ok({ queued: ids.length });
  });
}

import { after } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/server/http";
import { actorOf, requireAdmin } from "@/server/admin/guard";
import { adminMutation, adminRead, respond } from "@/server/admin/route";
import { cancelProcessing, deleteBook, getBook, getBookPage, linkBook, processBook, STALE_MS } from "@/server/books/service";

export const runtime = "nodejs";

/** GET ?page=N → نص الصفحة للمراجعة */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminRead("MANAGE_CURRICULUM", async () => {
    const b = await getBook(id);
    if (!b) return fail(404, "NOT_FOUND", "Book not found");
    const n = Number(new URL(req.url).searchParams.get("page") ?? 1);
    return ok({ book: b, page: Number.isInteger(n) && n > 0 ? await getBookPage(id, n) : null });
  });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("link"), curriculumId: z.string().min(10).max(40).nullable() }),
  z.object({ action: z.literal("reprocess"), ocr: z.boolean().optional() }),
  z.object({ action: z.literal("cancel") }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminMutation(req, "MANAGE_CURRICULUM", schema, async ({ actor, body }) => {
    if (body.action === "link") return respond(await linkBook(actor, id, body.curriculumId));
    if (body.action === "cancel") return ok(await cancelProcessing(actor, [id]));
    const b = await getBook(id);
    if (!b) return fail(404, "NOT_FOUND", "Book not found");
    // قيد المعالجة فعلاً (نبض حديث) → ارفض؛ العالق (بلا نبض) يجوز إعادة معالجته
    if (b.status === "PROCESSING" && Date.now() - b.updatedAt.getTime() < STALE_MS) return fail(409, "BUSY_OR_MISSING", "Already processing");
    after(() => processBook(id, { ocr: body.ocr ?? true, actor }));
    return ok({ queued: true });
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireAdmin("MANAGE_CURRICULUM");
  if ("res" in g) return g.res;
  const r = await deleteBook(actorOf(g.admin, req), id);
  return r.ok ? ok({ deleted: true }) : fail(r.code === "NOT_FOUND" ? 404 : 409, r.code, "Cannot delete");
}

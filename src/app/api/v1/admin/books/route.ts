import { after } from "next/server";
import { fail, ok } from "@/server/http";
import { limit } from "@/server/auth/route";
import { actorOf, requireAdmin } from "@/server/admin/guard";
import { adminRead } from "@/server/admin/route";
import { listLibraryBooks, MAX_BOOK_BYTES, processBook, uploadBook } from "@/server/books/service";

export const runtime = "nodejs";

export async function GET() {
  return adminRead("MANAGE_CURRICULUM", async () => ok(await listLibraryBooks()));
}

/** رفع كتاب PDF (multipart: file [+ curriculumId]). الاستخراج يجري في الخلفية بعد الرد. */
export async function POST(req: Request) {
  const g = await requireAdmin("MANAGE_CURRICULUM");
  if ("res" in g) return g.res;
  // مدير مصادَق يرفع مكتبة كاملة (مئات الكتب)؛ الحد لحماية الخادم من الإساءة لا لمنع العمل الطبيعي
  const rl = await limit([[`books:${g.admin.adminId}`, 1000, 3600]]);
  if (rl) return rl;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BOOK_BYTES + 1024 * 1024) return fail(413, "FILE_TOO_LARGE", "Max 100MB");
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) return fail(415, "UNSUPPORTED_MEDIA_TYPE", "multipart/form-data required");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "INVALID_FORM", "Malformed upload");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "VALIDATION_ERROR", "file is required");
  const cid = form.get("curriculumId");
  const r = await uploadBook(actorOf(g.admin, req), { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, typeof cid === "string" && cid ? cid : null);
  if (!r.ok) {
    const status = r.code === "FILE_TOO_LARGE" ? 413 : r.code === "DUPLICATE" ? 409 : 400;
    return Response.json({ error: { code: r.code, message: "Upload rejected", ...("existingId" in r ? { existingId: r.existingId } : {}) } }, { status });
  }
  const ocr = form.get("ocr") !== "0"; // يمكن رفع عشرات الكتب دون OCR ثم تشغيله لما يلزم فقط
  after(() => processBook(r.id, { ocr }));
  return Response.json({ data: { id: r.id, status: "UPLOADED" } }, { status: 201 });
}

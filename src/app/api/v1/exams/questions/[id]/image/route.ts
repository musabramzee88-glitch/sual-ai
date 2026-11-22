import { fail } from "@/server/http";
import { limit } from "@/server/auth/route";
import { requireExamAccess } from "@/server/exams/access";
import { notFound, respondExam } from "@/server/exams/route";
import { MAX_QUESTION_IMAGE_BYTES, questionImageBytes, removeQuestionImage, setQuestionImage } from "@/server/exams/media";

export const runtime = "nodejs";

/** معاينة صورة السؤال لصاحبها */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const img = await questionImageBytes(g.auth.user.id, (await params).id);
  if (!img) return notFound();
  return new Response(new Uint8Array(img.bytes), { headers: { "content-type": img.mime, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
}

/** رفع صورة للسؤال (multipart: file؛ PNG/JPEG حتى 2MB، النوع من المحتوى) */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const rl = await limit([[`qimg:${g.auth.user.id}`, 60, 3600]]);
  if (rl) return rl;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_QUESTION_IMAGE_BYTES + 64 * 1024) return fail(413, "FILE_TOO_LARGE", "Max 2MB");
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) return fail(415, "UNSUPPORTED_MEDIA_TYPE", "multipart/form-data required");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "INVALID_FORM", "Malformed upload");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "VALIDATION_ERROR", "file is required");
  return respondExam(await setQuestionImage(g.auth.user.id, (await params).id, new Uint8Array(await file.arrayBuffer())));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  return respondExam(await removeQuestionImage(g.auth.user.id, (await params).id));
}

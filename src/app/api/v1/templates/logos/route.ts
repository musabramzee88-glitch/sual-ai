import { fail, ok } from "@/server/http";
import { limit } from "@/server/auth/route";
import { requireExamAccess } from "@/server/exams/access";
import { respondExam } from "@/server/exams/route";
import { listLogos, MAX_LOGO_BYTES, uploadLogo } from "@/server/exams/templates";

export const runtime = "nodejs";

export async function GET() {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  return ok(await listLogos(g.auth.user.id));
}

/** رفع شعار (PNG/JPEG حتى 1MB؛ النوع من المحتوى لا من الاسم) */
export async function POST(req: Request) {
  const g = await requireExamAccess();
  if ("res" in g) return g.res;
  const rl = await limit([[`logo:${g.auth.user.id}`, 20, 3600]]);
  if (rl) return rl;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_LOGO_BYTES + 64 * 1024) return fail(413, "FILE_TOO_LARGE", "Max 1MB");
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) return fail(415, "UNSUPPORTED_MEDIA_TYPE", "multipart/form-data required");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "INVALID_FORM", "Malformed upload");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "VALIDATION_ERROR", "file is required");
  return respondExam(await uploadLogo(g.auth.user.id, new Uint8Array(await file.arrayBuffer())));
}

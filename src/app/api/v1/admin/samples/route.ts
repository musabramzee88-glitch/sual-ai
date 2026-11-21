import { fail, ok } from "@/server/http";
import { limit } from "@/server/auth/route";
import { actorOf, requireAdmin } from "@/server/admin/guard";
import { adminRead } from "@/server/admin/route";
import { createSample, listSamples, MAX_SAMPLE_BYTES, sampleMetaSchema } from "@/server/exams/samples";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET() {
  return adminRead("MANAGE_CURRICULUM", async () => ok(await listSamples()));
}

const STATUS: Record<string, number> = { FILE_TOO_LARGE: 413, UNSUPPORTED_FILE: 415, REFERENCE_NOT_FOUND: 404, TRANSCRIBE_FAILED: 502, EMPTY_TEXT: 422 };

/** رفع ورقة امتحان حقيقية (multipart: file, subjectCode, [gradeCode], title) ونسخ نصها حرفياً */
export async function POST(req: Request) {
  const g = await requireAdmin("MANAGE_CURRICULUM");
  if ("res" in g) return g.res;
  const rl = await limit([[`samples:${g.admin.adminId}`, 60, 3600]]);
  if (rl) return rl;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_SAMPLE_BYTES + 1024 * 1024) return fail(413, "FILE_TOO_LARGE", "Max 20MB");
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) return fail(415, "UNSUPPORTED_MEDIA_TYPE", "multipart/form-data required");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "INVALID_FORM", "Malformed upload");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "VALIDATION_ERROR", "file is required");
  const meta = sampleMetaSchema.safeParse({ subjectCode: form.get("subjectCode"), gradeCode: form.get("gradeCode") || null, title: form.get("title") });
  if (!meta.success) return fail(400, "VALIDATION_ERROR", "Invalid fields");
  const r = await createSample(actorOf(g.admin, req), meta.data, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  return r.ok ? Response.json({ data: r }, { status: 201 }) : fail(STATUS[r.code] ?? 400, r.code, "Upload rejected");
}

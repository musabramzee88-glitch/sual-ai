import "server-only";
import { fail, ok } from "../http";

/** رموز الأخطاء → حالة HTTP، ورسالة قصيرة (الواجهة تترجم الرمز) */
const STATUS: Record<string, number> = {
  NOT_FOUND: 404, CURRICULUM_NOT_FOUND: 404, CHAPTER_NOT_FOUND: 404, NO_BOOK: 409, TYPE_NOT_ALLOWED: 400, PAGE_OUT_OF_RANGE: 400,
  EMPTY_SOURCE: 400, SOURCE_MISSING: 409, ANSWER_NOT_IN_OPTIONS: 400, NOTHING_TO_UNDO: 409,
  AI_QUOTA: 503, AI_UNAVAILABLE: 503, AI_FAILED: 502, BAD_ORDER: 400, DUPLICATE_SECTION: 409, TOTAL_TOO_SMALL: 400,
  TEMPLATE_NOT_FOUND: 404, LOGO_NOT_FOUND: 404, TOO_MANY_TEMPLATES: 409, TOO_MANY_LOGOS: 409, FILE_TOO_LARGE: 413, UNSUPPORTED_FILE: 415,
};

export const respondExam = (r: { ok: true } | { ok: false; code: string; examId?: string; detail?: string }) =>
  r.ok ? ok(r) : Response.json({ error: { code: r.code, message: r.code, ...("examId" in r && r.examId ? { examId: r.examId } : {}), ...("detail" in r && r.detail ? { detail: r.detail } : {}) } }, { status: STATUS[r.code] ?? 400 });

export const notFound = () => fail(404, "NOT_FOUND", "Not found");

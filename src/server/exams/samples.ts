import "server-only";
import { z } from "zod";
import { db } from "../db";
import { audit, type Actor } from "../admin/audit";
import { geminiJson } from "../ai/gemini";
import { extractPdfPages } from "../books/extract";
import { renderPagesJpeg } from "../books/page-image";
import { hasRealText } from "../books/text";

/**
 * أوراق امتحان حقيقية لمدرسين عراقيين: تُرفع (PDF أو صورة)، يُنسخ نصها حرفياً (طبقة النص، أو نموذج الرؤية للمصوَّرة)،
 * ويراجعه المسؤول ويصححه، ثم يُستعمل مرجعَ أسلوب في التوليد: صياغة التعليمات والفروع والترقيم والمستوى — لا المحتوى.
 */
export const MAX_SAMPLE_BYTES = 20 * 1024 * 1024;
export const MAX_SAMPLE_PAGES = 8;
export const MAX_SAMPLE_CHARS = 15_000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const TRANSCRIBE = `These images are pages of a real exam paper written by an Iraqi school teacher.
Transcribe them EXACTLY as written, top to bottom, right to left: the header, every main question with its numbering (س١/ ، س٢/ …),
its instruction, its marks, every item with its numbering (أ- ، ب- ، ١- ، ٢- …), blanks (……), options, and any notes.
Keep the original wording, spelling and diacritics; do not correct, summarise, translate, reorder or add anything.
Use one line per item. Return only the transcription.`;

const fail = (code: string) => ({ ok: false as const, code });

/** نص ورقة الامتحان: طبقة نص سليمة إن وُجدت، وإلا نسخ حرفي بنموذج الرؤية (حتى 8 صفحات) */
export async function transcribe(bytes: Uint8Array, mime: string): Promise<{ text: string; via: "text" | "vision" }> {
  if (mime === "application/pdf") {
    const pages = (await extractPdfPages(bytes)).slice(0, MAX_SAMPLE_PAGES);
    const good = pages.filter((p) => p.hasText && hasRealText(p.text));
    if (pages.length > 0 && good.length === pages.length) return { text: pages.map((p) => p.text).join("\n\n").slice(0, MAX_SAMPLE_CHARS), via: "text" };
    const imgs = await renderPagesJpeg(bytes, pages.map((p) => p.pageNumber), 1800);
    const r = await geminiJson<{ text: string }>({ prompt: TRANSCRIBE, images: imgs.map((i) => ({ data: i.jpeg, mime: "image/jpeg" as const })), schema: { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] }, maxOutputTokens: 8192 });
    return { text: String(r.text ?? "").slice(0, MAX_SAMPLE_CHARS), via: "vision" };
  }
  const r = await geminiJson<{ text: string }>({ prompt: TRANSCRIBE, images: [{ data: Buffer.from(bytes), mime: mime === "image/png" ? "image/png" : "image/jpeg" }], schema: { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] }, maxOutputTokens: 8192 });
  return { text: String(r.text ?? "").slice(0, MAX_SAMPLE_CHARS), via: "vision" };
}

/** نوع الملف من محتواه لا من اسمه */
export function sniff(bytes: Uint8Array): string | null {
  const h = Buffer.from(bytes.subarray(0, 12));
  if (h.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (h[0] === 0xff && h[1] === 0xd8) return "image/jpeg";
  if (h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (h.subarray(0, 4).toString("latin1") === "RIFF" && h.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export const sampleMetaSchema = z.object({ subjectCode: z.string().regex(/^[A-Z0-9_]{1,32}$/), gradeCode: z.string().regex(/^[A-Z0-9_]{1,32}$/).nullable().optional(), title: z.string().trim().min(1).max(150) });

export async function createSample(actor: Actor, meta: z.infer<typeof sampleMetaSchema>, file: { name: string; bytes: Uint8Array }) {
  if (file.bytes.length > MAX_SAMPLE_BYTES) return fail("FILE_TOO_LARGE");
  const mime = sniff(file.bytes);
  if (!mime || (mime !== "application/pdf" && !(IMAGE_TYPES as readonly string[]).includes(mime))) return fail("UNSUPPORTED_FILE");
  const [subject, grade] = await Promise.all([
    db.subject.findUnique({ where: { code: meta.subjectCode } }),
    meta.gradeCode ? db.grade.findUnique({ where: { code: meta.gradeCode } }) : Promise.resolve(null),
  ]);
  if (!subject || (meta.gradeCode && !grade)) return fail("REFERENCE_NOT_FOUND");
  let text: string;
  try {
    text = (await transcribe(file.bytes, mime)).text.trim();
  } catch (e) {
    console.error(`[samples] transcription failed: ${(e as Error).name}`);
    return fail("TRANSCRIBE_FAILED");
  }
  if (text.length < 30) return fail("EMPTY_TEXT");
  const s = await db.$transaction(async (tx) => {
    const row = await tx.examSample.create({ data: { subjectId: subject.id, gradeId: grade?.id ?? null, title: meta.title, fileName: file.name.slice(0, 200), text, createdById: actor.adminId } });
    await audit(tx, actor, { action: "sample.create", targetType: "ExamSample", targetId: row.id, after: { title: row.title, subject: subject.code, grade: grade?.code ?? null, chars: text.length } });
    return row;
  });
  return { ok: true as const, id: s.id, chars: text.length };
}

export const sampleUpdateSchema = z.object({ title: z.string().trim().min(1).max(150).optional(), text: z.string().trim().min(30).max(MAX_SAMPLE_CHARS).optional(), isActive: z.boolean().optional() });

export async function updateSample(actor: Actor, id: string, patch: z.infer<typeof sampleUpdateSchema>) {
  return db.$transaction(async (tx) => {
    const s = await tx.examSample.findUnique({ where: { id } });
    if (!s) return fail("NOT_FOUND");
    await tx.examSample.update({ where: { id }, data: patch });
    await audit(tx, actor, { action: "sample.update", targetType: "ExamSample", targetId: id, before: { title: s.title, isActive: s.isActive, chars: s.text.length }, after: { ...patch, text: patch.text ? `${patch.text.length} chars` : undefined } });
    return { ok: true as const };
  });
}

export async function deleteSample(actor: Actor, id: string) {
  return db.$transaction(async (tx) => {
    const s = await tx.examSample.findUnique({ where: { id } });
    if (!s) return fail("NOT_FOUND");
    await tx.examSample.delete({ where: { id } });
    await audit(tx, actor, { action: "sample.delete", targetType: "ExamSample", targetId: id, before: { title: s.title } });
    return { ok: true as const };
  });
}

export const listSamples = () =>
  db.examSample.findMany({ orderBy: [{ subject: { sortOrder: "asc" } }, { createdAt: "desc" }], include: { subject: true, grade: true } });

/**
 * أوراق المرجع لامتحان: المادة نفسها، الأقرب صفاً أولاً (الصف نفسه، ثم المرحلة نفسها، ثم أوراق المادة العامة)،
 * حتى ورقتين و9000 حرف (حدود الطلب).
 */
export async function pickSamples(subjectId: string, gradeId: string, max = 2, maxChars = 9000): Promise<string[]> {
  const grade = await db.grade.findUnique({ where: { id: gradeId }, select: { stageId: true } });
  const rows = await db.examSample.findMany({ where: { subjectId, isActive: true }, include: { grade: { select: { stageId: true } } }, orderBy: { createdAt: "desc" }, take: 30 });
  const rank = (r: (typeof rows)[number]) => (r.gradeId === gradeId ? 0 : r.grade && grade && r.grade.stageId === grade.stageId ? 1 : r.gradeId === null ? 2 : 3);
  const out: string[] = [];
  let left = maxChars;
  for (const r of [...rows].sort((a, b) => rank(a) - rank(b))) {
    if (out.length >= max || left < 500) break;
    if (rank(r) === 3 && out.length > 0) break; // صف آخر من مرحلة أخرى: فقط إن لم يوجد غيره
    const t = r.text.slice(0, left);
    out.push(t);
    left -= t.length;
  }
  return out;
}

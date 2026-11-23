import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { modelDisplay, modelOf, type ModelLabel } from "@/lib/exam-models";
import { DEFAULT_TEMPLATE, FONTS, HEADER_KEYS, type HeaderKey, type Layout, type RenderExam, type RenderTemplate } from "@/lib/exam-render";
import { getExam } from "./service";
import { imageDataUris } from "./media";
import { sniff } from "./samples";
import { assetPath, assetsDir } from "./assets";

/**
 * قوالب ورقة الامتحان: أربعة قوالب جاهزة في الكود (معرّفها preset:NAME) وقوالب المدرس في ExamTemplate.
 * القالب يحمل الشكل وقيماً ثابتة (المدرسة، المديرية، المدرس، الشعار)؛ قيم الامتحان نفسه في Exam.headerConfig.
 */

const fail = (code: string) => ({ ok: false as const, code });
export const MAX_LOGO_BYTES = 1024 * 1024;
const LAYOUTS = ["CLASSIC", "SCHOOL", "ACADEMIC", "MINIMAL"] as const;

const text = (max: number) => z.string().trim().max(max);
const keyEnum = z.enum(HEADER_KEYS as [HeaderKey, ...HeaderKey[]]);
export const valuesSchema = z.record(keyEnum, text(150)).transform((v) => Object.fromEntries(Object.entries(v).filter(([, s]) => s)) as Partial<Record<HeaderKey, string>>);

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  layout: z.enum(LAYOUTS),
  pageSize: z.enum(["A4", "A3"]),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
  fontFamily: z.enum(FONTS),
  fontSizePt: z.number().int().min(10).max(22),
  lineSpacing: z.number().min(1).max(2.5),
  margins: z.object({ top: z.number().min(5).max(40), right: z.number().min(5).max(40), bottom: z.number().min(5).max(40), left: z.number().min(5).max(40) }),
  showPageNumbers: z.boolean(),
  visible: z.record(keyEnum, z.boolean()),
  values: valuesSchema,
  answerLines: z.number().int().min(0).max(8),
  footerNote: text(200).nullable(),
  signLine: z.boolean().default(false),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  /** أقصى عدد صفحات لورقة الأسئلة (0 = بلا حد): تُضبط الورقة تلقائياً لتتسع، والافتراضي صفحتان للطباعة وجهاً وقفا */
  maxPages: z.number().int().min(0).max(10).default(2),
  logoAssetId: z.string().min(10).max(40).nullable(),
  isDefault: z.boolean(),
});
export type TemplateInput = z.infer<typeof templateSchema>;

/** شكل headerFields المخزَّن */
type Stored = { layout: Layout; visible: Partial<Record<HeaderKey, boolean>>; values: Partial<Record<HeaderKey, string>>; answerLines: number; footerNote: string | null; signLine?: boolean; accent?: string | null; maxPages?: number; logoAssetId: string | null };

export type TemplateView = Omit<TemplateInput, "isDefault"> & { id: string; preset: boolean; isDefault: boolean };

const PRESET_NAMES: Record<Layout, { ar: string; en: string }> = {
  CLASSIC: { ar: "كلاسيكي عراقي", en: "Classic Iraqi" },
  SCHOOL: { ar: "مدرسي باسم المدرسة", en: "School header" },
  ACADEMIC: { ar: "رسمي بجدول بيانات", en: "Formal with info table" },
  MINIMAL: { ar: "مختصر", en: "Minimal" },
};

export function presets(lang: "ar" | "en" = "ar"): TemplateView[] {
  return LAYOUTS.map((layout) => ({
    id: `preset:${layout}`, preset: true, isDefault: false, name: PRESET_NAMES[layout][lang], layout,
    pageSize: "A4", orientation: "PORTRAIT", fontFamily: layout === "MINIMAL" ? "Simplified Arabic" : "Traditional Arabic",
    fontSizePt: layout === "MINIMAL" ? 13 : 14, lineSpacing: 1.65, margins: { ...DEFAULT_TEMPLATE.margins }, showPageNumbers: true,
    visible: layout === "MINIMAL" ? { republic: false, ministry: false, directorate: false, school: false } : {},
    values: {}, answerLines: 0, footerNote: DEFAULT_TEMPLATE.footerNote, signLine: false, accent: null, maxPages: 2, logoAssetId: null,
  }));
}

function toView(t: Prisma.ExamTemplateGetPayload<object>): TemplateView {
  const h = (t.headerFields ?? {}) as Partial<Stored>;
  const m = (t.margins ?? {}) as Partial<TemplateInput["margins"]>;
  return {
    id: t.id, preset: false, isDefault: t.isDefault, name: t.name,
    layout: LAYOUTS.includes(h.layout as Layout) ? (h.layout as Layout) : t.kind !== "CUSTOM" ? (t.kind as Layout) : "CLASSIC",
    pageSize: t.pageSize, orientation: t.orientation,
    fontFamily: (FONTS as readonly string[]).includes(t.fontFamily) ? (t.fontFamily as TemplateView["fontFamily"]) : "Traditional Arabic",
    fontSizePt: t.fontSizePt, lineSpacing: Number(t.lineSpacing),
    margins: { top: m.top ?? 12, right: m.right ?? 14, bottom: m.bottom ?? 12, left: m.left ?? 14 },
    showPageNumbers: t.showPageNumbers, visible: h.visible ?? {}, values: h.values ?? {},
    answerLines: h.answerLines ?? 0, footerNote: h.footerNote === undefined ? DEFAULT_TEMPLATE.footerNote : h.footerNote, signLine: h.signLine ?? false, accent: h.accent ?? null, maxPages: h.maxPages ?? 2, logoAssetId: h.logoAssetId ?? null,
  };
}

export async function listTemplates(userId: string, lang: "ar" | "en" = "ar") {
  const own = await db.examTemplate.findMany({ where: { ownerId: userId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] });
  return [...own.map(toView), ...presets(lang)];
}

async function ownsLogo(userId: string, assetId: string | null) {
  if (!assetId) return true;
  return !!(await db.templateAsset.findFirst({ where: { id: assetId, ownerId: userId, kind: "LOGO" }, select: { id: true } }));
}

const data = (d: TemplateInput) => ({
  name: d.name, kind: d.layout, pageSize: d.pageSize, orientation: d.orientation, direction: "RTL" as const, fontFamily: d.fontFamily,
  fontSizePt: d.fontSizePt, lineSpacing: d.lineSpacing, margins: d.margins, showPageNumbers: d.showPageNumbers, isDefault: d.isDefault,
  headerFields: { layout: d.layout, visible: d.visible, values: d.values, answerLines: d.answerLines, footerNote: d.footerNote, signLine: d.signLine, accent: d.accent, maxPages: d.maxPages, logoAssetId: d.logoAssetId } satisfies Stored,
});

const MAX_TEMPLATES = 30;

export async function createTemplate(userId: string, d: TemplateInput) {
  if (!(await ownsLogo(userId, d.logoAssetId))) return fail("LOGO_NOT_FOUND");
  if ((await db.examTemplate.count({ where: { ownerId: userId } })) >= MAX_TEMPLATES) return fail("TOO_MANY_TEMPLATES");
  const t = await db.$transaction(async (tx) => {
    if (d.isDefault) await tx.examTemplate.updateMany({ where: { ownerId: userId, isDefault: true }, data: { isDefault: false } });
    return tx.examTemplate.create({ data: { ownerId: userId, ...data(d) } });
  });
  return { ok: true as const, id: t.id };
}

export async function updateTemplate(userId: string, id: string, d: TemplateInput) {
  const t = await db.examTemplate.findFirst({ where: { id, ownerId: userId }, select: { id: true } });
  if (!t) return fail("NOT_FOUND");
  if (!(await ownsLogo(userId, d.logoAssetId))) return fail("LOGO_NOT_FOUND");
  await db.$transaction(async (tx) => {
    if (d.isDefault) await tx.examTemplate.updateMany({ where: { ownerId: userId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
    await tx.examTemplate.update({ where: { id }, data: data(d) });
  });
  return { ok: true as const, id };
}

export async function deleteTemplate(userId: string, id: string) {
  const r = await db.examTemplate.deleteMany({ where: { id, ownerId: userId } });
  return r.count ? { ok: true as const } : fail("NOT_FOUND");
}

// ── الشعار ─────────────────────────────────────────
export async function uploadLogo(userId: string, bytes: Uint8Array) {
  if (bytes.length > MAX_LOGO_BYTES) return fail("FILE_TOO_LARGE");
  const mime = sniff(bytes);
  if (mime !== "image/png" && mime !== "image/jpeg") return fail("UNSUPPORTED_FILE");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await db.templateAsset.findFirst({ where: { ownerId: userId, kind: "LOGO", sha256 }, select: { id: true } });
  if (existing) return { ok: true as const, id: existing.id };
  if ((await db.templateAsset.count({ where: { ownerId: userId, kind: "LOGO" } })) >= 20) return fail("TOO_MANY_LOGOS");
  const storageKey = `${randomBytes(16).toString("hex")}.${mime === "image/png" ? "png" : "jpg"}`;
  await mkdir(assetsDir(), { recursive: true });
  await writeFile(assetPath(storageKey), bytes);
  const a = await db.templateAsset.create({ data: { ownerId: userId, kind: "LOGO", storageKey, mimeType: mime, sizeBytes: bytes.length, sha256 } });
  return { ok: true as const, id: a.id };
}

export async function listLogos(userId: string) {
  return db.templateAsset.findMany({ where: { ownerId: userId, kind: "LOGO" }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true } });
}

export async function deleteLogo(userId: string, id: string) {
  const a = await db.templateAsset.findFirst({ where: { id, ownerId: userId, kind: "LOGO" } });
  if (!a) return fail("NOT_FOUND");
  await db.templateAsset.delete({ where: { id } });
  await unlink(assetPath(a.storageKey)).catch(() => {});
  return { ok: true as const };
}

/** الشعار كـ data URI (يُضمَّن في HTML فيعمل في الطباعة وPDF دون طلبات شبكة) */
export async function logoDataUri(userId: string, id: string | null): Promise<string | null> {
  if (!id) return null;
  const a = await db.templateAsset.findFirst({ where: { id, ownerId: userId, kind: "LOGO" } });
  if (!a) return null;
  try {
    return `data:${a.mimeType};base64,${(await readFile(assetPath(a.storageKey))).toString("base64")}`;
  } catch {
    return null;
  }
}

/** صورة الشعار لعرضها في الواجهة */
export async function logoBytes(userId: string, id: string) {
  const a = await db.templateAsset.findFirst({ where: { id, ownerId: userId, kind: "LOGO" } });
  if (!a) return null;
  try {
    return { bytes: await readFile(assetPath(a.storageKey)), mime: a.mimeType };
  } catch {
    return null;
  }
}

// ── ترويسة الامتحان ─────────────────────────────────
export const examHeaderSchema = z.object({ templateId: z.string().min(5).max(40).nullable(), values: valuesSchema });

/** اختيار قالب وقيم الترويسة لامتحان (تُحفظ مع الامتحان) */
export async function setExamHeader(userId: string, examId: string, d: z.infer<typeof examHeaderSchema>) {
  const exam = await db.exam.findFirst({ where: { id: examId, ownerId: userId, deletedAt: null }, select: { id: true } });
  if (!exam) return fail("NOT_FOUND");
  const presetId = d.templateId?.startsWith("preset:") ? d.templateId : null;
  if (presetId && !LAYOUTS.includes(presetId.slice(7) as Layout)) return fail("TEMPLATE_NOT_FOUND");
  const own = d.templateId && !presetId ? await db.examTemplate.findFirst({ where: { id: d.templateId, ownerId: userId }, select: { id: true } }) : null;
  if (d.templateId && !presetId && !own) return fail("TEMPLATE_NOT_FOUND");
  await db.exam.update({ where: { id: examId }, data: { templateId: own?.id ?? null, headerConfig: { preset: presetId, values: d.values } } });
  return { ok: true as const };
}

/** جدول مخزَّن → جدول العارض (يتجاهل أي شكل غير سليم) */
export function asTable(v: unknown): { header: boolean; cells: string[][] } | null {
  const t = v as { header?: unknown; cells?: unknown } | null;
  if (!t || !Array.isArray(t.cells) || t.cells.length === 0) return null;
  const cells = t.cells.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
  return cells.every((r) => r.length > 0) ? { header: t.header === true, cells } : null;
}

type HeaderConfig = { preset?: string | null; values?: Partial<Record<HeaderKey, string>> };

const KIND_AR: Record<string, string> = { QUIZ: "اختبار قصير", MONTHLY: "الامتحان الشهري", MIDTERM: "امتحان نصف السنة", FINAL: "امتحان نهاية السنة", MINISTERIAL_STYLE: "امتحان بأسلوب الوزاري" };
const KIND_EN: Record<string, string> = { QUIZ: "Quiz", MONTHLY: "Monthly exam", MIDTERM: "Mid-year exam", FINAL: "Final exam", MINISTERIAL_STYLE: "Ministerial-style exam" };
const ROUND_AR: Record<string, string> = { FIRST: "الأول", SECOND: "الثاني", THIRD: "الثالث" };

/** يختار القالب الفعّال للامتحان: المختار، وإلا افتراضي المدرس، وإلا الكلاسيكي */
async function effectiveTemplate(userId: string, templateId: string | null, cfg: HeaderConfig, override?: string | null): Promise<TemplateView> {
  const want = override ?? (templateId ?? cfg.preset ?? null);
  if (want?.startsWith("preset:")) return presets().find((p) => p.id === want) ?? presets()[0];
  if (want) {
    const t = await db.examTemplate.findFirst({ where: { id: want, ownerId: userId } });
    if (t) return toView(t);
  }
  const def = await db.examTemplate.findFirst({ where: { ownerId: userId, isDefault: true } });
  return def ? toView(def) : presets()[0];
}

export function toRender(t: TemplateView, logo: string | null): RenderTemplate {
  return {
    layout: t.layout, pageSize: t.pageSize, orientation: t.orientation, fontFamily: t.fontFamily, fontSizePt: t.fontSizePt, lineSpacing: t.lineSpacing,
    margins: t.margins, visible: t.visible, values: t.values, logoDataUri: logo, answerLines: t.answerLines, footerNote: t.footerNote, signLine: t.signLine, accent: t.accent,
  };
}

/** كل ما يحتاجه العارض لامتحان مالك: الأسئلة + القالب + قيم الترويسة (الامتحان يتقدّم على القالب) */
export async function examRenderInput(userId: string, examId: string, opts: { templateId?: string | null; model?: ModelLabel | null } = {}) {
  const exam = await getExam(userId, examId);
  if (!exam || exam.status !== "READY") return null;
  const cfg = (exam.headerConfig ?? {}) as HeaderConfig;
  const tpl = await effectiveTemplate(userId, exam.templateId, cfg, opts.templateId);
  const en = exam.language === "EN";
  const num = (n: number) => (en ? String(n) : n.toLocaleString("ar-EG"));
  // قيم مشتقة من الامتحان نفسه؛ ما يكتبه المدرس للامتحان يتقدّم عليها
  const derived: Partial<Record<HeaderKey, string>> = {
    title: exam.title,
    subject: en ? exam.subject.nameEn : exam.subject.nameAr,
    grade: en ? exam.grade.nameEn : exam.grade.nameAr,
    total: `${num(exam.totalMarks)} ${en ? "marks" : "درجة"}`,
    examKind: (en ? KIND_EN : KIND_AR)[exam.kind],
    ...(exam.durationMinutes ? { time: `${num(exam.durationMinutes)} ${en ? "minutes" : "دقيقة"}` } : {}),
    ...(exam.round ? { round: en ? exam.round.toLowerCase() : ROUND_AR[exam.round] } : {}),
    ...(exam.academicYearLabel ? { yearTerm: exam.academicYearLabel } : {}),
    model: modelDisplay(opts.model ?? "A", en ? "EN" : "AR"),
  };
  const images = await imageDataUris(userId, exam.sections.flatMap((s) => s.branches.map((b) => b.imageAssetId).filter((x): x is string => !!x)));
  const baseExam: RenderExam = {
    lang: exam.language === "EN" ? "EN" : "AR",
    values: { ...derived, ...(cfg.values ?? {}) },
    forceShow: Object.keys(cfg.values ?? {}) as HeaderKey[],
    sectionsToAnswer: exam.sectionsToAnswer, firstRequired: exam.firstRequired,
    sections: exam.sections.map((s) => ({
      instruction: s.instruction ?? s.prompt, marks: s.marks, answerCount: s.answerCount, type: s.type,
      branches: s.branches.map((b) => ({ prompt: b.prompt, options: Array.isArray(b.options) ? (b.options as string[]) : null, answer: b.answer ?? "", marks: b.marks, image: b.imageAssetId ? images[b.imageAssetId] ?? null : null, table: asTable(b.table) })),
    })),
  };
  // نموذج محدّد (A/B/C/D): خلط مشتق من الأصل، ويظهر اسمه في الترويسة ولو كان حقل النموذج مخفياً
  const renderExam: RenderExam = opts.model ? { ...modelOf(baseExam, opts.model, exam.id), forceShow: [...(baseExam.forceShow ?? []), "model"] } : baseExam;
  const tplRender = toRender(tpl, await logoDataUri(userId, tpl.logoAssetId));
  if (en && tplRender.footerNote === DEFAULT_TEMPLATE.footerNote) tplRender.footerNote = "Good luck";
  return { exam, template: tpl, renderExam, renderTemplate: tplRender, headerValues: cfg.values ?? {}, selectedTemplateId: opts.templateId ?? exam.templateId ?? cfg.preset ?? null };
}

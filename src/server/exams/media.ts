import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { assetPath, assetsDir } from "./assets";
import { sniff } from "./samples";
import { TABLE_STYLES } from "@/lib/exam-render";

/**
 * صورة وجدول داخل السؤال. الصورة TemplateAsset من نوع QUESTION_IMAGE (PNG/JPEG بالمحتوى، ≤ 2MB، مسار مولَّد داخل
 * STORAGE_DIR/assets)، تُضمَّن في الورقة data URI. الصورة والجدول لا يدخلان في سجل التراجع (يُحذفان بزر خاص)،
 * و«سؤال بديل» يمسحهما لأنه سؤال جديد.
 */
const fail = (code: string) => ({ ok: false as const, code });
export const MAX_QUESTION_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGES_PER_USER = 300;

export const tableSchema = z
  .object({
    header: z.boolean(),
    // شكل العرض (اختياري، الافتراضي GRID): TABLE_STYLES في exam-render
    style: z.enum(TABLE_STYLES).optional(),
    cells: z.array(z.array(z.string().trim().max(120)).min(1).max(8)).min(1).max(12),
  })
  .refine((t) => t.cells.every((r) => r.length === t.cells[0].length), { message: "ragged" });
export type QuestionTable = z.infer<typeof tableSchema>;

const owned = (userId: string, questionId: string) =>
  db.examQuestion.findFirst({
    where: { id: questionId, deletedAt: null, parentId: { not: null }, examModel: { exam: { ownerId: userId, deletedAt: null } } },
    select: { id: true, imageAssetId: true },
  });

/** يحذف الصورة من القرص والقاعدة إن لم يعد يستعملها سؤال */
async function dropIfUnused(assetId: string | null) {
  if (!assetId) return;
  if ((await db.examQuestion.count({ where: { imageAssetId: assetId } })) > 0) return;
  const a = await db.templateAsset.findUnique({ where: { id: assetId } });
  if (!a || a.kind !== "QUESTION_IMAGE") return;
  await db.templateAsset.delete({ where: { id: assetId } }).catch(() => {});
  await unlink(assetPath(a.storageKey)).catch(() => {});
}

export async function setQuestionImage(userId: string, questionId: string, bytes: Uint8Array) {
  const q = await owned(userId, questionId);
  if (!q) return fail("NOT_FOUND");
  if (bytes.length > MAX_QUESTION_IMAGE_BYTES) return fail("FILE_TOO_LARGE");
  const mime = sniff(bytes);
  if (mime !== "image/png" && mime !== "image/jpeg") return fail("UNSUPPORTED_FILE");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let asset = await db.templateAsset.findFirst({ where: { ownerId: userId, kind: "QUESTION_IMAGE", sha256 }, select: { id: true } });
  if (!asset) {
    if ((await db.templateAsset.count({ where: { ownerId: userId, kind: "QUESTION_IMAGE" } })) >= MAX_IMAGES_PER_USER) return fail("TOO_MANY_IMAGES");
    const storageKey = `${randomBytes(16).toString("hex")}.${mime === "image/png" ? "png" : "jpg"}`;
    await mkdir(assetsDir(), { recursive: true });
    await writeFile(assetPath(storageKey), bytes);
    asset = await db.templateAsset.create({ data: { ownerId: userId, kind: "QUESTION_IMAGE", storageKey, mimeType: mime, sizeBytes: bytes.length, sha256 }, select: { id: true } });
  }
  await db.examQuestion.update({ where: { id: q.id }, data: { imageAssetId: asset.id } });
  if (q.imageAssetId && q.imageAssetId !== asset.id) await dropIfUnused(q.imageAssetId);
  return { ok: true as const, id: asset.id };
}

export async function removeQuestionImage(userId: string, questionId: string) {
  const q = await owned(userId, questionId);
  if (!q) return fail("NOT_FOUND");
  await db.examQuestion.update({ where: { id: q.id }, data: { imageAssetId: null } });
  await dropIfUnused(q.imageAssetId);
  return { ok: true as const };
}

export async function setQuestionTable(userId: string, questionId: string, table: QuestionTable | null) {
  const q = await owned(userId, questionId);
  if (!q) return fail("NOT_FOUND");
  await db.examQuestion.update({ where: { id: q.id }, data: { table: table ?? Prisma.DbNull } });
  return { ok: true as const };
}

/** بايتات صورة سؤال لصاحبها (للمعاينة في المحرر) */
export async function questionImageBytes(userId: string, questionId: string) {
  const q = await db.examQuestion.findFirst({
    where: { id: questionId, deletedAt: null, examModel: { exam: { ownerId: userId, deletedAt: null } } },
    select: { imageAsset: { select: { storageKey: true, mimeType: true, ownerId: true } } },
  });
  const a = q?.imageAsset;
  if (!a || a.ownerId !== userId) return null;
  try {
    return { bytes: await readFile(assetPath(a.storageKey)), mime: a.mimeType };
  } catch {
    return null;
  }
}

/** صور الأسئلة كـ data URI (للعارض): معرّف الصورة → URI، لصاحبها فقط */
export async function imageDataUris(userId: string, ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return {};
  const assets = await db.templateAsset.findMany({ where: { id: { in: uniq }, ownerId: userId, kind: "QUESTION_IMAGE" } });
  const out: Record<string, string> = {};
  for (const a of assets) {
    try {
      out[a.id] = `data:${a.mimeType};base64,${(await readFile(assetPath(a.storageKey))).toString("base64")}`;
    } catch {
      /* الملف مفقود: يظهر السؤال بلا صورة */
    }
  }
  return out;
}

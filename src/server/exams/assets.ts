import "server-only";
import path from "node:path";
import { env } from "../env";

/** مجلد أصول الصور (شعارات وصور الأسئلة) ومسار ملف داخله؛ المسار يُتحقق أنه داخل المجلد */
export const assetsDir = () => path.resolve(env.STORAGE_DIR, "assets");
export function assetPath(storageKey: string) {
  const p = path.resolve(assetsDir(), storageKey);
  if (!p.startsWith(assetsDir() + path.sep)) throw new Error("bad asset path");
  return p;
}


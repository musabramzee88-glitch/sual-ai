import "server-only";
import type { AdminPermission } from "@prisma/client";
import { adminDicts } from "@/lib/i18n/admin";
import { getDictionary } from "@/lib/i18n/server";
import { requireAdminPage } from "./guard";

/** سياق صفحات الإدارة: يتحقق من الصلاحية على الخادم ويجهّز القاموس. */
export async function adminCtx(perm: AdminPermission) {
  const admin = await requireAdminPage(perm);
  const { t: site, locale } = await getDictionary();
  const t = adminDicts[locale];
  const L = { confirm: t.act.confirm, done: t.act.done, errors: t.errors };
  const pick = (x: { nameAr: string; nameEn: string }) => (locale === "ar" ? x.nameAr : x.nameEn);
  return { admin, site, locale, t, L, pick };
}

/**
 * عنوان العميل لحدود المعدّل والسجلات (دالة نقية).
 * x-forwarded-for يكتبه العميل نفسه أولاً، والوكيل الموثوق (nginx/Render/Cloudflare) يضيف العنوان الحقيقي في آخره.
 * لذلك يُؤخذ العنصر رقم `hops` من النهاية لا الأول: الأول يمكن تزويره فيتجاوز المهاجم حد المحاولات بتغييره في كل طلب.
 * hops = عدد الوكلاء الموثوقين أمام الخادم (TRUSTED_PROXY_HOPS، الافتراضي 1).
 * بلا وكيل، Next يضع عنوان الاتصال في الترويسة إن غابت فقط؛ لذلك يجب تشغيل الإنتاج خلف وكيل يضيف العنوان.
 */
export function pickClientIp(xff: string | null, realIp: string | null, hops = 1): string {
  const list = (xff ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const h = Math.max(1, Math.floor(hops));
  const ip = list.length ? list[Math.max(0, list.length - h)] : realIp?.trim() || "unknown";
  return ip.slice(0, 64);
}

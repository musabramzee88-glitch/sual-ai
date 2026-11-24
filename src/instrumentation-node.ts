/** (جزء خادم Node من instrumentation.ts — يُستورد فقط في بيئة nodejs)
 *
 * يعمل مرة عند تشغيل الخادم. في الإنتاج ومع ALERT_EMAIL: يطلب فحص حالة النظام بعد 3 دقائق ثم كل ساعة،
 * فيرسل بريداً عند عطل جديد أو عودة للعمل (src/server/admin/alerts.ts).
 * لا يستورد كود الخادم هنا (يكسر بناء Next)؛ يطلب المسار الداخلي /api/v1/internal/alerts على الجهاز نفسه
 * بتوقيع من AUTH_SECRET (لا يقبله المسار من غير الخادم نفسه).
 * تنبيه: إن توقف الخادم كله فلا أحد يرسل؛ لذلك يُستحسن مراقب خارجي مجاني على /api/v1/health.
 */
export async function startAlerts() {
  if (process.env.NODE_ENV !== "production" || !process.env.ALERT_EMAIL || !process.env.AUTH_SECRET) return;
  const g = globalThis as { __sualAlerts?: boolean };
  if (g.__sualAlerts) return;
  g.__sualAlerts = true;
  const { createHmac } = await import("node:crypto");
  const tick = async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", process.env.AUTH_SECRET!).update(`alerts:${ts}`).digest("hex");
    try {
      const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/v1/internal/alerts`, { method: "POST", headers: { "x-sual-alerts": `${ts}.${sig}` } });
      if (!r.ok) console.error(`[alerts] الفحص أعاد ${r.status}`);
    } catch (e) {
      console.error(`[alerts] تعذّر الفحص: ${(e as Error).message}`);
    }
  };
  setTimeout(tick, 3 * 60_000).unref();
  setInterval(tick, 3600_000).unref();
}

/**
 * قواعد تقييم «حالة النظام» (دوال نقية مُختبَرة؛ لا قاعدة بيانات ولا ملفات): تحوّل القياسات الخام إلى فحوص
 * بمستوى ok / warn / error ورسالة مفهومة. التجميع في status.ts.
 */
export type Level = "ok" | "warn" | "error";
export type Check = { key: string; level: Level; value: string; hint?: string };

export type Raw = {
  db: { ok: boolean; ms: number; error?: string };
  migrations: { files: number; applied: number };
  backup: { lastOkAt: string | null; lastAt: string | null; lastError: string | null; dbBytes: number | null; offsite?: "ok" | "error" | null; offsiteError?: string | null };
  disk: { freeBytes: number | null };
  pdf: { ok: boolean; ms: number; error?: string };
  ai: { keyConfigured: boolean; failed24h: number; lastError: string | null };
  books: { processing: number; failed: number; stuck: number };
  exports: { failed24h: number };
  /** الخط الذي يُرسم به «Traditional Arabic» (لينكس فقط؛ null = لا يُعرف أو ليس لينكس) */
  fonts?: { platform: string; arabic: string | null };
  now: number;
};

const H = 3600 * 1000;
const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;
const mb = (b: number) => `${(b / 1024 ** 2).toFixed(1)} MB`;
const ago = (iso: string, now: number) => {
  const h = (now - new Date(iso).getTime()) / H;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} دقيقة` : h < 48 ? `${Math.round(h)} ساعة` : `${Math.round(h / 24)} يوم`;
};

export function evaluate(r: Raw): Check[] {
  const out: Check[] = [];
  out.push(r.db.ok
    ? { key: "db", level: r.db.ms > 1000 ? "warn" : "ok", value: `تعمل (${r.db.ms} ms)` }
    : { key: "db", level: "error", value: "لا تستجيب", hint: "تأكد أن خدمة PostgreSQL تعمل على الجهاز." });

  const pending = r.migrations.files - r.migrations.applied;
  out.push(pending > 0
    ? { key: "migrations", level: "error", value: `${pending} تحديث غير مطبَّق`, hint: "شغّل npm run db:deploy (أو أعد تشغيل start-sual فيطبّقها تلقائياً)." }
    : { key: "migrations", level: "ok", value: "محدَّثة" });

  if (!r.backup.lastOkAt) out.push({ key: "backup", level: "error", value: "لا توجد نسخة احتياطية", hint: r.backup.lastError ? `آخر خطأ: ${r.backup.lastError}` : "شغّل npm run backup، أو start-sual فينسخ يومياً." });
  else {
    const age = (r.now - new Date(r.backup.lastOkAt).getTime()) / H;
    const failedSince = r.backup.lastAt && r.backup.lastAt !== r.backup.lastOkAt && r.backup.lastError;
    out.push({
      key: "backup", level: age > 50 ? "error" : age > 26 || failedSince ? "warn" : "ok",
      value: `آخر نسخة قبل ${ago(r.backup.lastOkAt, r.now)}${r.backup.dbBytes ? ` (${mb(r.backup.dbBytes)})` : ""}`,
      hint: failedSince ? `آخر محاولة فشلت: ${r.backup.lastError}` : age > 26 ? "النسخ اليومي متوقف: هل نافذة start-sual مفتوحة؟" : undefined,
    });
  }

  // النسخة خارج الخادم (OFFSITE_REMOTE): تظهر فقط إن كانت مفعّلة، فيُرسَل «عادت للعمل» حين تنجح بعد فشل
  if (r.backup.offsite === "error") out.push({ key: "offsite", level: "warn", value: "النسخة خارج الخادم فشلت", hint: `النسخة المحلية سليمة، لكن لم تُرسل للتخزين الخارجي: ${r.backup.offsiteError ?? "خطأ"}` });
  else if (r.backup.offsite === "ok") out.push({ key: "offsite", level: "ok", value: "تُرسل يومياً" });

  if (r.disk.freeBytes !== null) {
    const f = r.disk.freeBytes;
    out.push({ key: "disk", level: f < 0.5 * 1024 ** 3 ? "error" : f < 2 * 1024 ** 3 ? "warn" : "ok", value: `${gb(f)} متاحة`, hint: f < 2 * 1024 ** 3 ? "المساحة قليلة: الكتب الجديدة والنسخ الاحتياطية قد تفشل." : undefined });
  }

  out.push(r.pdf.ok
    ? { key: "pdf", level: r.pdf.ms > 15000 ? "warn" : "ok", value: `يعمل (${(r.pdf.ms / 1000).toFixed(1)} ث)` }
    : { key: "pdf", level: "error", value: "لا يعمل", hint: r.pdf.error ? `${r.pdf.error} — ثبّت Edge أو Chrome أو ضع CHROMIUM_PATH.` : "ثبّت Edge أو Chrome أو ضع CHROMIUM_PATH." });

  out.push(!r.ai.keyConfigured
    ? { key: "ai", level: "error", value: "مفتاح Gemini غير موجود", hint: "ضع GEMINI_API_KEY في .env (npm run ai:check للتحقق)." }
    : { key: "ai", level: r.ai.failed24h >= 3 ? "warn" : "ok", value: r.ai.failed24h ? `${r.ai.failed24h} توليد فاشل خلال 24 ساعة` : "يعمل", hint: r.ai.failed24h && r.ai.lastError ? `آخر خطأ: ${r.ai.lastError}${/QUOTA|day/i.test(r.ai.lastError) ? " (انتهت الحصة اليومية المجانية)" : ""}` : undefined });

  out.push(r.books.stuck > 0
    ? { key: "books", level: "warn", value: `${r.books.stuck} كتاب عالق في المعالجة`, hint: "npm run books:reprocess يعيد معالجة العالقة." }
    : r.books.failed > 0 ? { key: "books", level: "warn", value: `${r.books.failed} كتاب فشلت معالجته`, hint: "راجعها في مكتبة الكتب." }
    : { key: "books", level: "ok", value: r.books.processing ? `${r.books.processing} قيد المعالجة` : "سليمة" });

  if (r.fonts?.platform === "linux") {
    out.push(r.fonts.arabic === "Amiri"
      ? { key: "fonts", level: "ok", value: "مثبّتة" }
      : { key: "fonts", level: "warn", value: "الخطوط العربية غير مثبّتة", hint: "أوراق PDF ستخرج بخط بديل. ثبّت الحزم وملف deploy/fonts/60-sual-arabic.conf (يفعلها سكربت تنصيب الخادم)." });
  }

  out.push({ key: "exports", level: r.exports.failed24h >= 3 ? "warn" : "ok", value: r.exports.failed24h ? `${r.exports.failed24h} تصدير فاشل خلال 24 ساعة` : "سليم" });
  return out;
}

/** المستوى العام: أسوأ فحص */
export const overall = (checks: Check[]): Level => (checks.some((c) => c.level === "error") ? "error" : checks.some((c) => c.level === "warn") ? "warn" : "ok");

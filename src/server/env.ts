import "server-only";
import { z } from "zod";

/**
 * متغيرات البيئة للخادم فقط — لا تُكشف للواجهة الأمامية.
 * المفاتيح الخارجية اختيارية في المرحلة 0 وتصبح مطلوبة عند تفعيل خدماتها.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  // مفتاح سري لتوقيع/تجزئة الرموز (32 بايت على الأقل)
  AUTH_SECRET: z.string().min(32).optional(),
  // الذكاء الاصطناعي
  // المزوّد: gemini (مستوى مجاني متاح) أو anthropic. يُبدَّل من .env فقط.
  AI_PROVIDER: z.enum(["gemini", "anthropic"]).default("gemini"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  // «-latest» اسم مستعار يتبع أحدث نسخة Flash؛ أوامر ai:check تعرض النماذج المتاحة لمفتاحك
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  // البريد
  EMAIL_PROVIDER: z.enum(["resend", "smtp"]).optional(),
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  // SMTP (مثلاً Gmail: smtp.gmail.com:587 + App Password)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // true للمنفذ 465 (TLS مباشر)؛ false مع 587 (STARTTLS)
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  // يُفرض STARTTLS مع المنفذ 587 افتراضياً؛ false للتجارب المحلية فقط
  SMTP_REQUIRE_TLS: z.enum(["true", "false"]).default("true"),
  // SMS وبوابة الدفع — تُحدَّد في المرحلة 5
  SMS_PROVIDER: z.string().optional(),
  PAYMENT_PROVIDER: z.string().optional(),
  // التخزين
  STORAGE_DIR: z.string().default("./storage"),
  // قراءة الكتب المصوّرة بـ OCR محلي (مكلفة على المعالج). false لتعطيلها.
  OCR_ENABLED: z.enum(["true", "false"]).default("true"),
  // عدد خيوط OCR المتوازية (1–4): أعلى = أسرع وأسخن وأكثر ذاكرة
  OCR_WORKERS: z.coerce.number().int().min(1).max(4).default(2),
});

// المتغيرات الفارغة (KEY=) في .env تُعامل كأنها غير معرّفة
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
export const env = schema.parse(raw);

/** سر التوقيع/التجزئة — مطلوب لكل مسارات الحسابات. */
export function authSecret(): string {
  if (!env.AUTH_SECRET) throw new Error("AUTH_SECRET is required (>= 32 chars)");
  return env.AUTH_SECRET;
}

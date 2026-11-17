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
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  // البريد
  EMAIL_PROVIDER: z.enum(["resend", "smtp"]).optional(),
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  // SMS وبوابة الدفع — تُحدَّد في المرحلة 5
  SMS_PROVIDER: z.string().optional(),
  PAYMENT_PROVIDER: z.string().optional(),
  // التخزين
  STORAGE_DIR: z.string().default("./storage"),
});

export const env = schema.parse(process.env);

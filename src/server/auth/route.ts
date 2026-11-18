import "server-only";
import { z } from "zod";
import { fail } from "../http";
import { clientIp, rateLimit } from "./ratelimit";
import { EmailUnavailableError } from "./mailer";
import { SmsUnavailableError } from "./sms";
import { getAuth, type AuthContext } from "./session";
import type { AccessState } from "@/lib/access";

/** قراءة JSON مع حد حجم وتحقق Zod. يُرجع Response عند الخطأ. */
export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<{ data: z.infer<T> } | { res: Response }> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { res: fail(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json") };
  }
  const text = await req.text();
  if (text.length > 16_000) return { res: fail(413, "PAYLOAD_TOO_LARGE", "Request too large") };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { res: fail(400, "INVALID_JSON", "Malformed JSON") };
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    const first = r.error.issues[0];
    const msg = first.message && /^[A-Z_]+$/.test(first.message) ? first.message : "VALIDATION_ERROR";
    return { res: Response.json({ error: { code: msg, message: "Invalid input", field: first.path.join(".") } }, { status: 400 }) };
  }
  return { data: r.data };
}

/** يفرض عدة حدود معدّل؛ يُرجع Response 429 عند التجاوز. */
export async function limit(rules: [key: string, max: number, windowSec: number][]): Promise<Response | null> {
  for (const [key, max, win] of rules) {
    if (!(await rateLimit(key, max, win))) {
      return Response.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, { status: 429, headers: { "Retry-After": String(win) } });
    }
  }
  return null;
}

export const meta = (req: Request) => ({ ip: clientIp(req), userAgent: req.headers.get("user-agent") });

export const emailUnavailable = () => fail(503, "EMAIL_UNAVAILABLE", "Email service is not available. Try again later.");
export const isEmailError = (e: unknown) => e instanceof EmailUnavailableError;
export const smsUnavailable = () => fail(503, "SMS_UNAVAILABLE", "SMS service is not available. Use e-mail verification.");
/** يحوّل أخطاء إرسال الرمز (بريد/SMS) إلى استجابة، أو null إن لم يكن الخطأ منها */
export const sendError = (e: unknown): Response | null => (isEmailError(e) ? emailUnavailable() : e instanceof SmsUnavailableError ? smsUnavailable() : null);

const DENY: Record<Exclude<AccessState, "SUBSCRIPTION_ACTIVE">, [number, string]> = {
  UNVERIFIED: [403, "ACCOUNT_UNVERIFIED"],
  AWAITING_PAYMENT: [402, "SUBSCRIPTION_REQUIRED"],
  AWAITING_APPROVAL: [403, "AWAITING_APPROVAL"],
  SUBSCRIPTION_EXPIRED: [402, "SUBSCRIPTION_EXPIRED"],
  SUBSCRIPTION_SUSPENDED: [403, "SUBSCRIPTION_SUSPENDED"],
  ACCOUNT_SUSPENDED: [403, "ACCOUNT_SUSPENDED"],
  BANNED: [403, "ACCOUNT_BANNED"],
};

/** حارس API: يتطلب جلسة صالحة. */
export async function requireAuth(): Promise<{ auth: AuthContext } | { res: Response }> {
  const auth = await getAuth();
  return auth ? { auth } : { res: fail(401, "UNAUTHENTICATED", "Authentication required") };
}

/** حارس الخدمات المدفوعة (يُطبّق على الخادم عبر resolveAccess). استعمله في كل مسار مدفوع. */
export async function requirePaid(): Promise<{ auth: AuthContext } | { res: Response }> {
  const g = await requireAuth();
  if ("res" in g) return g;
  if (g.auth.access === "SUBSCRIPTION_ACTIVE") return g;
  const [status, code] = DENY[g.auth.access];
  return { res: fail(status, code, "Access denied") };
}

import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * واجهة بوابة الدفع بالبطاقة. البوابة الحقيقية (Qi Card / ZainCash / FIB …) تُضاف هنا بتطبيق PaymentGateway
 * حين يتوفر عقد التاجر والمفاتيح، دون تغيير تدفق الاشتراك (card.ts) أو المسارات.
 * البوابة التجريبية «sandbox» محلية: لا دفع حقيقي، تُفعَّل صراحة بـ PAYMENT_PROVIDER=sandbox، وصفحتها تقول ذلك بوضوح.
 */
export type CheckoutInput = { reference: string; amountIqd: number; description: string; returnUrl: string; webhookUrl: string };
export type WebhookEvent = { eventId: string; type: string; providerTransactionId: string; status: "SUCCEEDED" | "FAILED" | "PENDING"; amountIqd: number | null; currency: string | null };
export type VerifyResult = { ok: true; event: WebhookEvent } | { ok: false; reason: string };

export interface PaymentGateway {
  name: string;
  /** بوابة تجريبية (لا مال حقيقي) */
  test: boolean;
  createCheckout(i: CheckoutInput): Promise<{ redirectUrl: string; providerTransactionId: string }>;
  verifyWebhook(raw: string, headers: Headers, now?: number): VerifyResult;
}

export const SIGNATURE_HEADER = "x-sual-signature";
const TOLERANCE_SEC = 300;

/** توقيع: t=<ثواني>,v1=<HMAC-SHA256(سر, "t.body")> — الختم الزمني يمنع إعادة إرسال إشعار قديم */
export function signPayload(secret: string, raw: string, nowSec = Math.floor(Date.now() / 1000)) {
  return `t=${nowSec},v1=${createHmac("sha256", secret).update(`${nowSec}.${raw}`).digest("hex")}`;
}

export function verifySignature(secret: string, raw: string, header: string | null, nowSec = Math.floor(Date.now() / 1000)): { ok: true } | { ok: false; reason: string } {
  if (!header) return { ok: false, reason: "MISSING_SIGNATURE" };
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return { ok: false, reason: "BAD_SIGNATURE_FORMAT" };
  if (Math.abs(nowSec - t) > TOLERANCE_SEC) return { ok: false, reason: "STALE_SIGNATURE" };
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest();
  const given = Buffer.from(parts.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected) ? { ok: true } : { ok: false, reason: "BAD_SIGNATURE" };
}

/** جسم إشعار البوابة التجريبية (بصيغة قريبة من البوابات الحقيقية) */
export function parseSandboxEvent(raw: string): WebhookEvent | null {
  try {
    const j = JSON.parse(raw) as { id?: unknown; type?: unknown; data?: { transactionId?: unknown; status?: unknown; amountIqd?: unknown; currency?: unknown } };
    const status = j.data?.status;
    if (typeof j.id !== "string" || typeof j.type !== "string" || typeof j.data?.transactionId !== "string" || (status !== "SUCCEEDED" && status !== "FAILED" && status !== "PENDING")) return null;
    return { eventId: j.id.slice(0, 100), type: j.type.slice(0, 60), providerTransactionId: j.data.transactionId.slice(0, 100), status, amountIqd: typeof j.data.amountIqd === "number" ? j.data.amountIqd : null, currency: typeof j.data.currency === "string" ? j.data.currency : null };
  } catch {
    return null;
  }
}

function sandbox(secret: string): PaymentGateway {
  return {
    name: "sandbox",
    test: true,
    async createCheckout(i) {
      return { redirectUrl: `/subscribe/sandbox/${encodeURIComponent(i.reference)}`, providerTransactionId: `sbx_${randomBytes(12).toString("hex")}` };
    },
    verifyWebhook(raw, headers, now) {
      const sig = verifySignature(secret, raw, headers.get(SIGNATURE_HEADER), now);
      if (!sig.ok) return sig;
      const event = parseSandboxEvent(raw);
      return event ? { ok: true, event } : { ok: false, reason: "BAD_PAYLOAD" };
    },
  };
}

/** البوابة المفعّلة، أو null (الدفع النقدي وحده) */
export function gateway(): PaymentGateway | null {
  if (env.PAYMENT_PROVIDER === "sandbox") {
    if (!env.PAYMENT_WEBHOOK_SECRET) { console.error("[payments] PAYMENT_PROVIDER=sandbox requires PAYMENT_WEBHOOK_SECRET (32+ chars)"); return null; }
    return sandbox(env.PAYMENT_WEBHOOK_SECRET);
  }
  return null;
}

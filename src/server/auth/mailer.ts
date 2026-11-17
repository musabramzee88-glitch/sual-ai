import "server-only";
import { env } from "../env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export class EmailUnavailableError extends Error {
  constructor(msg = "Email provider is not configured") {
    super(msg);
  }
}

/** Resend عبر HTTPS. لا يُطبع أي محتوى للرسالة (يحوي رموزاً سرية) في السجلات. */
class ResendMailer implements Mailer {
  async send({ to, subject, text }: Mail) {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new EmailUnavailableError();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // نسجّل رمز الحالة واسم الخطأ فقط (لا محتوى الرسالة ولا المفتاح)
      const body = (await res.json().catch(() => ({}))) as { name?: string; message?: string };
      console.error(`[mailer] Resend rejected the request: status=${res.status} name=${body.name ?? "?"} message=${(body.message ?? "").replace(/\S+@\S+/g, "<email>")}`);
      throw new EmailUnavailableError(`Email provider rejected the request (${res.status})`);
    }
  }
}

class UnconfiguredMailer implements Mailer {
  async send(): Promise<void> {
    throw new EmailUnavailableError();
  }
}

let current: Mailer | undefined;
export function getMailer(): Mailer {
  current ??= env.EMAIL_PROVIDER === "resend" ? new ResendMailer() : new UnconfiguredMailer();
  return current;
}
/** للاختبارات فقط */
export const setMailer = (m: Mailer | undefined) => {
  current = m;
};

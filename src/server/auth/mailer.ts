import "server-only";
import nodemailer from "nodemailer";
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

export type SmtpConfig = { host: string; port: number; secure: boolean; user?: string; pass?: string; from: string; requireTLS?: boolean };

/** SMTP عبر nodemailer. لا يُسجَّل إلا رمز الخطأ (لا محتوى الرسالة ولا بيانات الدخول). */
export function createSmtpMailer(c: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    requireTLS: c.requireTLS ?? !c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return {
    async send({ to, subject, text }) {
      try {
        await transport.sendMail({ from: c.from, to, subject, text });
      } catch (e) {
        const code = (e as { code?: string; responseCode?: number }).code ?? "UNKNOWN";
        const rc = (e as { responseCode?: number }).responseCode ?? "-";
        console.error(`[mailer] SMTP send failed: code=${code} response=${rc}`);
        throw new EmailUnavailableError(`SMTP send failed (${code})`);
      }
    },
  };
}

class UnconfiguredMailer implements Mailer {
  async send(): Promise<void> {
    throw new EmailUnavailableError();
  }
}

function buildMailer(): Mailer {
  if (env.EMAIL_PROVIDER === "resend") return new ResendMailer();
  if (env.EMAIL_PROVIDER === "smtp" && env.SMTP_HOST && env.EMAIL_FROM) {
    return createSmtpMailer({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE === "true", user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.EMAIL_FROM, requireTLS: env.SMTP_SECURE === "true" ? false : env.SMTP_REQUIRE_TLS === "true" });
  }
  return new UnconfiguredMailer();
}

let current: Mailer | undefined;
export function getMailer(): Mailer {
  current ??= buildMailer();
  return current;
}
/** للاختبارات فقط */
export const setMailer = (m: Mailer | undefined) => {
  current = m;
};

import { z } from "zod";

export const normalizeEmail = (v: string) => v.trim().toLowerCase();

/** يقبل 07XXXXXXXXX / 7XXXXXXXXX / +9647XXXXXXXXX / 009647XXXXXXXXX (وأرقاماً عربية) ويُرجع E.164 أو null */
export function normalizePhone(raw: string): string | null {
  const digits = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[\s\-()]/g, "");
  let n = digits;
  if (n.startsWith("00")) n = "+" + n.slice(2);
  else if (n.startsWith("07")) n = "+964" + n.slice(1);
  else if (n.startsWith("7")) n = "+964" + n;
  else if (n.startsWith("964")) n = "+" + n;
  return /^\+9647\d{9}$/.test(n) ? n : null;
}

export const emailSchema = z.string().trim().max(254).email().transform(normalizeEmail);
export const phoneSchema = z
  .string()
  .max(32)
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "INVALID_PHONE" });
    return p ?? "";
  });

/** معرّف دخول: بريد أو هاتف */
export function classifyIdentifier(raw: string): { email: string } | { phone: string } | null {
  const v = raw.trim();
  if (v.includes("@")) {
    const e = emailSchema.safeParse(v);
    return e.success ? { email: e.data } : null;
  }
  const p = normalizePhone(v);
  return p ? { phone: p } : null;
}

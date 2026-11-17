import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { authSecret } from "../env";

/** HMAC-SHA256 بالسر — لتجزئة الرموز (OTP، جلسات، استعادة) قبل تخزينها. */
export const hmac = (purpose: string, value: string) =>
  createHmac("sha256", authSecret()).update(`${purpose}:${value}`).digest("hex");

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** رمز عشوائي عالي الإنتروبيا (جلسات، أجهزة، استعادة) */
export const randomToken = () => randomBytes(32).toString("base64url");

/** OTP من 6 أرقام بمولّد آمن تشفيرياً */
export const randomOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/**
 * اسم ملف يختاره المستخدم → اسم آمن للتنزيل (دالة نقية).
 * يزيل محارف ويندوز الممنوعة والتحكّم والاتجاه الخفية، ويطوي المسافات، ويمنع الأسماء المحجوزة (CON, NUL…)
 * والنقاط/المسافات في الطرفين، ويقصّ الطول، ويضيف الامتداد .pdf مرة واحدة.
 */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function safeFileName(input: string | null | undefined, fallback: string, ext = "pdf"): string {
  const clean = (s: string) =>
    s
      .replace(/[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, "")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(new RegExp(`\\.${ext}$`, "i"), "")
      .replace(/^[\s.]+|[\s.]+$/g, "")
      .slice(0, 100)
      .trim();
  let base = clean(input ?? "");
  if (!base) base = clean(fallback) || "exam";
  if (RESERVED.test(base)) base = `_${base}`;
  return `${base}.${ext}`;
}

/** ترويسة Content-Disposition: اسم ASCII احتياطي + الاسم الكامل UTF-8 (RFC 5987) */
export function contentDisposition(name: string, asciiFallback: string): string {
  const enc = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${asciiFallback.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${enc}`;
}

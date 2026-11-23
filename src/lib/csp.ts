/**
 * سياسة أمان المحتوى (CSP) — مصدر واحد لـ next.config والـ middleware (دالة نقية مُختبَرة).
 * مع nonce (صفحات HTML عبر الـ middleware): السكربتات المسموحة فقط ما يحمل الرمز العشوائي لهذا الطلب، وما تحمّله هي
 * ('strict-dynamic')؛ أي سكربت مضمَّن يُحقن بلا الرمز يُمنع. بلا nonce (ملفات ثابتة وواجهة API): السياسة الأساسية.
 * الأنماط المضمّنة مسموحة (Tailwind وورقة الامتحان داخل iframe srcdoc لا سكربت فيها).
 */
export function buildCsp({ nonce, dev = false }: { nonce?: string; dev?: boolean } = {}): string {
  const script = nonce ? `'self' 'nonce-${nonce}' 'strict-dynamic'` : "'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src ${script}${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/** رمز عشوائي لكل طلب (128 بت، base64) */
export function newNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

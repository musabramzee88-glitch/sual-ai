import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// سياسة أمان المحتوى — تُشدَّد أكثر (nonces) عند إضافة بوابة الدفع
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // مكتبات Node تُحمَّل كما هي على الخادم (لا تُجمَّع)
  serverExternalPackages: ["pdfjs-dist", "argon2", "tesseract.js", "@napi-rs/canvas"],
  experimental: {
    // الـ middleware يمر على /api؛ بدون هذا تُقصّ ملفات الكتب الأكبر من 10MB
    middlewareClientMaxBodySize: "110mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

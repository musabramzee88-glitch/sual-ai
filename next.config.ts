import type { NextConfig } from "next";
import { buildCsp } from "./src/lib/csp";

const isDev = process.env.NODE_ENV !== "production";

// سياسة أمان المحتوى الأساسية (الملفات وواجهة API)؛ صفحات HTML تأخذ سياسة nonce أشد من الـ middleware (src/lib/csp.ts)
const csp = buildCsp({ dev: isDev });

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
  // مجلد البناء: npm run live يبني النسخة الجديدة في مجلد بديل والقديمة ما زالت تعمل (scripts/live.mjs)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // مكتبات Node تُحمَّل كما هي على الخادم (لا تُجمَّع)
  serverExternalPackages: ["pdfjs-dist", "argon2", "tesseract.js", "@napi-rs/canvas", "playwright-core"],
  experimental: {
    // الـ middleware يمر على /api؛ بدون هذا تُقصّ ملفات الكتب الأكبر من 10MB
    middlewareClientMaxBodySize: "110mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

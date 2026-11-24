import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/csp";

const PROTECTED = ["/dashboard", "/subscribe", "/admin", "/settings", "/exams"];
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
// أكبر جسم JSON مقبول (parseBody يحدّ أيضاً بـ 16 ألف حرف، وإشعارات الدفع بـ 64KB)
const MAX_JSON_BODY = 256 * 1024;
const MB = 1024 * 1024;
/** مسارات الرفع وحدها تقبل أجساماً كبيرة، كلٌّ بسقفه (المسار نفسه يتحقق بدقة من الحجم والنوع) */
const UPLOAD_LIMITS: [RegExp, number][] = [
  [/^\/api\/v1\/admin\/books$/, 101 * MB],
  [/^\/api\/v1\/admin\/samples$/, 21 * MB],
  [/^\/api\/v1\/templates\/logos$/, 2 * MB],
  [/^\/api\/v1\/exams\/questions\/[^/]+\/image$/, 3 * MB],
];

/**
 * حماية CSRF لواجهة /api/v1: أي طلب يغيّر الحالة يجب أن يأتي من نفس المصدر
 * (Origin أو Sec-Fetch-Site). مع SameSite=Lax وإلزام Content-Type: application/json.
 * وحجب أولي للصفحات المحمية بغياب الجلسة (التحقق الفعلي يتم على الخادم في كل صفحة/API).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") && !SAFE.has(req.method)) {
    const origin = req.headers.get("origin");
    const site = req.headers.get("sec-fetch-site");
    const host = req.headers.get("host");
    let sameOrigin: boolean;
    if (origin) {
      try {
        sameOrigin = new URL(origin).host === host;
      } catch {
        sameOrigin = false;
      }
    } else {
      sameOrigin = site === null || site === "same-origin" || site === "none";
    }
    if (!sameOrigin) {
      return NextResponse.json({ error: { code: "CSRF_BLOCKED", message: "Cross-site request blocked" } }, { status: 403 });
    }
  }

  // حجم الجسم: السقف الكبير (middlewareClientMaxBodySize) لمسارات الرفع فقط؛ غيرها JSON صغير.
  // يُرفض بالترويسة قبل قراءة الجسم إلى الذاكرة (لا إغراق للذاكرة بطلبات ضخمة على مسارات عامة كالدخول).
  if (pathname.startsWith("/api/") && !SAFE.has(req.method)) {
    const max = UPLOAD_LIMITS.find(([re]) => re.test(pathname))?.[1] ?? MAX_JSON_BODY;
    const len = req.headers.get("content-length");
    const chunked = req.headers.get("transfer-encoding")?.toLowerCase().includes("chunked") ?? false;
    if ((len !== null && Number(len) > max) || (len === null && chunked)) {
      return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request too large" } }, { status: 413 });
    }
  }

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.get("sual_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/api/")) return NextResponse.next();
  // صفحات HTML: سياسة nonce (Next يضع الرمز على سكربتاته من ترويسة الطلب)
  const nonce = newNonce();
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV !== "production" });
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);
  return res;
}

// كل الصفحات وواجهة API، عدا الملفات الثابتة (لا تحتاج nonce)
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest).*)"] };

import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard"];
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

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

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.get("sual_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*", "/dashboard/:path*", "/dashboard"] };

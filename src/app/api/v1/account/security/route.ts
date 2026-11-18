import { z } from "zod";
import { fail, ok } from "@/server/http";
import { limit, parseBody, requireAuth } from "@/server/auth/route";
import { setLoginSecurity } from "@/server/auth/service";
import { smsAvailable } from "@/server/auth/sms";

export async function GET() {
  const g = await requireAuth();
  if ("res" in g) return g.res;
  const u = g.auth.user;
  return ok({ loginSecurity: u.loginSecurity, emailVerified: u.emailVerified, phoneVerified: u.phoneVerified, smsAvailable: smsAvailable() });
}

const schema = z.object({ mode: z.enum(["SINGLE", "BOTH"]), password: z.string().min(1).max(128) });
const CODES: Record<string, number> = { INVALID_CREDENTIALS: 403, SMS_UNAVAILABLE: 503, BOTH_NOT_VERIFIED: 409, NOT_FOUND: 404 };

/** تفعيل «الاثنين معاً» أو الرجوع إلى رمز واحد — يتطلب كلمة المرور */
export async function PUT(req: Request) {
  const g = await requireAuth();
  if ("res" in g) return g.res;
  const rl = await limit([[`secmode:${g.auth.user.id}`, 10, 3600]]);
  if (rl) return rl;
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const r = await setLoginSecurity(g.auth.user.id, b.data.mode, b.data.password);
  return r.ok ? ok({ loginSecurity: b.data.mode }) : fail(CODES[r.code] ?? 400, r.code, "Rejected");
}

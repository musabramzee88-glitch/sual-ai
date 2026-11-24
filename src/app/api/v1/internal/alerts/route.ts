import { createHmac, timingSafeEqual } from "node:crypto";
import { fail, ok } from "@/server/http";
import { authSecret } from "@/server/env";
import { runAlerts } from "@/server/admin/alert-runner";

export const runtime = "nodejs";

/**
 * فحص التنبيهات (يطلبه instrumentation.ts من الخادم نفسه كل ساعة). يقبل فقط توقيعاً من AUTH_SECRET
 * بختم زمني حديث (±5 دقائق)؛ لا جلسة ولا صلاحية مستخدم.
 */
export async function POST(req: Request) {
  const [ts, sig] = (req.headers.get("x-sual-alerts") ?? "").split(".");
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!ts || !sig || !(age <= 300)) return fail(401, "UNAUTHORIZED", "Unauthorized");
  const want = createHmac("sha256", authSecret()).update(`alerts:${ts}`).digest();
  const got = Buffer.from(sig, "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return fail(401, "UNAUTHORIZED", "Unauthorized");
  try {
    return ok(await runAlerts());
  } catch (e) {
    console.error(`[alerts] ${(e as Error).message.split("\n")[0]}`);
    return fail(500, "ALERTS_FAILED", "Alert check failed");
  }
}

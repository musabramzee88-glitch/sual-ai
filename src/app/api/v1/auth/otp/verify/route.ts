import { z } from "zod";
import { fail, ok } from "@/server/http";
import { completeOtp } from "@/server/auth/service";
import { clientIp } from "@/server/auth/ratelimit";
import { limit, meta, parseBody } from "@/server/auth/route";

const item = z.object({ challengeId: z.string().min(12).max(44), code: z.string().regex(/^\d{6}$/) });
const schema = z.object({ challenges: z.array(item).min(1).max(2), rememberDevice: z.boolean().optional() });

/** رمز واحد عادةً، ورمزان معاً عند تفعيل «الاثنين» */
export async function POST(req: Request) {
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const rl = await limit([[`otpv:ip:${clientIp(req)}`, 30, 600], ...b.data.challenges.map((c): [string, number, number] => [`otpv:ch:${c.challengeId}`, 10, 600])]);
  if (rl) return rl;
  const r = await completeOtp(b.data.challenges, b.data.rememberDevice === true, meta(req));
  return r.ok ? ok({ verified: true }) : fail(r.code === "TOO_MANY_ATTEMPTS" ? 429 : 400, r.code, "Verification failed");
}

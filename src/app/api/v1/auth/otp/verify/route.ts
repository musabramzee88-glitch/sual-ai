import { z } from "zod";
import { fail, ok } from "@/server/http";
import { completeOtp } from "@/server/auth/service";
import { clientIp } from "@/server/auth/ratelimit";
import { limit, meta, parseBody } from "@/server/auth/route";

const schema = z.object({ challengeId: z.string().min(10).max(40), code: z.string().regex(/^\d{6}$/), rememberDevice: z.boolean().optional() });

export async function POST(req: Request) {
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const rl = await limit([[`otpv:ip:${clientIp(req)}`, 30, 600], [`otpv:ch:${b.data.challengeId}`, 10, 600]]);
  if (rl) return rl;
  const r = await completeOtp(b.data.challengeId, b.data.code, b.data.rememberDevice === true, meta(req));
  return r.ok ? ok({ verified: true }) : fail(r.code === "TOO_MANY_ATTEMPTS" ? 429 : 400, r.code, "Verification failed");
}

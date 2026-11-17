import { z } from "zod";
import { fail, ok } from "@/server/http";
import { resendOtp } from "@/server/auth/service";
import { clientIp } from "@/server/auth/ratelimit";
import { emailUnavailable, isEmailError, limit, parseBody } from "@/server/auth/route";

const schema = z.object({ challengeId: z.string().min(10).max(40) });

export async function POST(req: Request) {
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const rl = await limit([[`otpr:ip:${clientIp(req)}`, 10, 3600], [`otpr:ch:${b.data.challengeId}`, 5, 3600]]);
  if (rl) return rl;
  try {
    const r = await resendOtp(b.data.challengeId);
    if (!r.ok) return fail(r.code === "OTP_COOLDOWN" ? 429 : 400, r.code, "Cannot resend");
    return ok({ challengeId: r.challengeId, resendAvailableAt: r.resendAvailableAt });
  } catch (e) {
    if (isEmailError(e)) return emailUnavailable();
    throw e;
  }
}

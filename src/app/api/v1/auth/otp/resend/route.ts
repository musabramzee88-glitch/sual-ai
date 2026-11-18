import { z } from "zod";
import { fail, ok } from "@/server/http";
import { resendOtp } from "@/server/auth/service";
import { clientIp } from "@/server/auth/ratelimit";
import { limit, parseBody, sendError } from "@/server/auth/route";

const schema = z.object({ challengeId: z.string().min(12).max(44) });

export async function POST(req: Request) {
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const rl = await limit([[`otpr:ip:${clientIp(req)}`, 10, 3600], [`otpr:ch:${b.data.challengeId}`, 5, 3600]]);
  if (rl) return rl;
  try {
    const r = await resendOtp(b.data.challengeId);
    if (!r.ok) return fail(r.code === "OTP_COOLDOWN" ? 429 : 400, r.code, "Cannot resend");
    return ok({ challenge: r.challenge });
  } catch (e) {
    const res = sendError(e);
    if (res) return res;
    throw e;
  }
}

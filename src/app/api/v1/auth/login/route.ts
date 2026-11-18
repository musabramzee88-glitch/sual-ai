import { z } from "zod";
import { fail, ok } from "@/server/http";
import { login } from "@/server/auth/service";
import { clientIp } from "@/server/auth/ratelimit";
import { limit, meta, parseBody, sendError } from "@/server/auth/route";

const schema = z.object({ identifier: z.string().trim().min(3).max(254), password: z.string().min(1).max(128) });

export async function POST(req: Request) {
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const rl = await limit([
    [`login:ip:${clientIp(req)}`, 30, 600],
    [`login:id:${b.data.identifier.toLowerCase()}`, 10, 600],
  ]);
  if (rl) return rl;
  try {
    const r = await login(b.data.identifier, b.data.password, meta(req));
    if (!r.ok) {
      const status = r.code === "INVALID_CREDENTIALS" ? 401 : r.code === "OTP_COOLDOWN" ? 429 : r.code === "NO_CHANNEL_AVAILABLE" ? 503 : 403;
      return fail(status, r.code, "Login failed");
    }
    return ok(r.step === "done" ? { step: "done" } : { step: "otp", purpose: r.purpose, challenges: r.challenges });
  } catch (e) {
    const res = sendError(e);
    if (res) return res;
    throw e;
  }
}

import { z } from "zod";
import { fail, ok } from "@/server/http";
import { limit, parseBody, requireAuth, sendError } from "@/server/auth/route";
import { startChannelVerification } from "@/server/auth/service";

const schema = z.object({ channel: z.enum(["EMAIL", "PHONE"]) });

export async function POST(req: Request) {
  const g = await requireAuth();
  if ("res" in g) return g.res;
  const rl = await limit([[`chverify:${g.auth.user.id}`, 10, 3600]]);
  if (rl) return rl;
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  try {
    const r = await startChannelVerification(g.auth.user.id, b.data.channel);
    return r.ok ? ok({ challenge: r.challenge }) : fail(r.code === "OTP_COOLDOWN" ? 429 : 409, r.code, "Cannot start verification");
  } catch (e) {
    const res = sendError(e);
    if (res) return res;
    throw e;
  }
}

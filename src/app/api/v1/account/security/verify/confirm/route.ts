import { z } from "zod";
import { fail, ok } from "@/server/http";
import { limit, parseBody, requireAuth } from "@/server/auth/route";
import { confirmChannelVerification } from "@/server/auth/service";

const schema = z.object({ challengeId: z.string().min(12).max(44), code: z.string().regex(/^\d{6}$/) });

export async function POST(req: Request) {
  const g = await requireAuth();
  if ("res" in g) return g.res;
  const rl = await limit([[`chconfirm:${g.auth.user.id}`, 20, 3600]]);
  if (rl) return rl;
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const r = await confirmChannelVerification(g.auth.user.id, b.data.challengeId, b.data.code);
  return r.ok ? ok({ verified: true }) : fail(r.code === "TOO_MANY_ATTEMPTS" ? 429 : 400, r.code, "Verification failed");
}

import { z } from "zod";
import { ok } from "@/server/http";
import { requestPasswordReset } from "@/server/auth/service";
import { clientIp } from "@/server/auth/ratelimit";
import { limit, parseBody } from "@/server/auth/route";

const schema = z.object({ identifier: z.string().trim().min(3).max(254) });

/** رد موحّد دائماً لمنع كشف وجود الحسابات. */
export async function POST(req: Request) {
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const rl = await limit([[`forgot:ip:${clientIp(req)}`, 10, 3600], [`forgot:id:${b.data.identifier.toLowerCase()}`, 3, 3600]]);
  if (rl) return rl;
  try {
    await requestPasswordReset(b.data.identifier);
  } catch {
    // لا نكشف أي فشل (بريد غير مهيأ أو غيره) للمستدعي
  }
  return ok({ accepted: true });
}

import { z } from "zod";
import { fail, ok } from "@/server/http";
import { resetPassword } from "@/server/auth/service";
import { clientIp } from "@/server/auth/ratelimit";
import { limit, parseBody } from "@/server/auth/route";

const schema = z.object({ token: z.string().min(20).max(128), password: z.string().max(128), passwordConfirm: z.string().max(128) }).refine((v) => v.password === v.passwordConfirm, { message: "PASSWORD_MISMATCH" });

export async function POST(req: Request) {
  const b = await parseBody(req, schema);
  if ("res" in b) return b.res;
  const rl = await limit([[`reset:ip:${clientIp(req)}`, 10, 3600]]);
  if (rl) return rl;
  const r = await resetPassword(b.data.token, b.data.password);
  return r.ok ? ok({ reset: true }) : fail(400, r.code, "Password reset failed");
}

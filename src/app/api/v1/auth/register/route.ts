import { fail } from "@/server/http";
import { register, registerSchema } from "@/server/auth/service";
import { clientIp } from "@/server/auth/ratelimit";
import { emailUnavailable, isEmailError, limit, parseBody } from "@/server/auth/route";

export async function POST(req: Request) {
  const rl = await limit([[`register:ip:${clientIp(req)}`, 10, 3600]]);
  if (rl) return rl;
  const b = await parseBody(req, registerSchema);
  if ("res" in b) return b.res;
  try {
    const r = await register(b.data);
    if (!r.ok) return fail(r.code === "INVALID_DIRECTORATE" ? 400 : 409, r.code, "Registration failed");
    return Response.json({ data: { challengeId: r.challengeId, purpose: "SIGNUP" } }, { status: 201 });
  } catch (e) {
    if (isEmailError(e)) return emailUnavailable();
    throw e;
  }
}

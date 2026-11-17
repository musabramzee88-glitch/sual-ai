import { ok } from "@/server/http";
import { revokeCurrentSession } from "@/server/auth/session";

export async function POST() {
  await revokeCurrentSession();
  return ok({ loggedOut: true });
}

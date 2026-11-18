import { ok } from "@/server/http";
import { listActivePlans } from "@/server/billing/service";

export const dynamic = "force-dynamic";
export async function GET() {
  return ok(await listActivePlans());
}

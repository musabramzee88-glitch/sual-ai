import { listGovernorates } from "@/server/curriculum";
import { ok } from "@/server/http";

export const dynamic = "force-dynamic";
export async function GET() {
  return ok(await listGovernorates(), 300);
}
